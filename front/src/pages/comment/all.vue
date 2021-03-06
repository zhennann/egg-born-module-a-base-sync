<template>
  <eb-page ptr @ptr:refresh="onRefresh" infinite :infinitePreloader="false" @infinite="onInfinite">
    <eb-navbar large largeTransparent :title="$text('Comment List')" eb-back-link="Back">
      <f7-nav-right>
        <eb-link :iconMaterial="order==='desc'?'arrow_downward':'arrow_upward'" :onPerform="onPerformSort"></eb-link>
      </f7-nav-right>
    </eb-navbar>
    <template v-if="moduleStyle">
      <f7-card class="comment" v-for="item of items" :key="item.h_id">
        <f7-card-header>
          <div class="header-container">
            <div class="header-atom">
              <eb-link :context="item" :onPerform="onPerformViewAtom">{{item.atomName}}</eb-link>
            </div>
            <div class="header-comment">
              <div class="title">
                <img class="avatar avatar32" :src="getItemMedia(item)">
                <div class="name">{{item.h_userName}}</div>
                <div class="date">#{{item.h_sorting}} · {{$meta.util.formatDateTimeRelative(item.h_createdAt)}}</div>
              </div>
              <div class="actions">
                <eb-link v-if="item.h_userId===user.id" class="action" iconMaterial="edit" :eb-href="`comment/item?atomId=${item.atomId}&commentId=${item.h_id}&replyId=0`"></eb-link>
                <eb-link v-if="item.h_userId===user.id || rightDeleteComment" class="action" iconMaterial="delete_forever" :context="item" :onPerform="onPerformDelete"></eb-link>
                <eb-link class="action" :iconMaterial="item.h_heart?'favorite':'favorite_border'" :context="item" :onPerform="onPerformHeart">{{item.h_heartCount}}</eb-link>
                <eb-link v-if="!user.anonymous" class="action" iconMaterial="reply" :eb-href="`comment/item?atomId=${item.atomId}&commentId=0&replyId=${item.h_id}`"></eb-link>
              </div>
            </div>
          </div>
        </f7-card-header>
        <f7-card-content padding class="markdown-body" v-html="item.h_html"></f7-card-content>
      </f7-card>
    </template>
    <eb-load-more ref="loadMore" :onLoadClear="onLoadClear" :onLoadMore="onLoadMore" :autoInit="true"></eb-load-more>
  </eb-page>
</template>
<script>
import ebAtomActions from '../../common/atomActions.js';
export default {
  mixins: [ebAtomActions],
  data() {
    const query = this.$f7route.query;
    const module = query && query.module;
    const atomClassName = query && query.atomClassName;
    const atomClass = (module && atomClassName) ? { module, atomClassName } : null;
    let where = (query && query.where) ? JSON.parse(query.where) : null;
    // scene
    const scene = query && query.scene;
    if (scene === 'mine') {
      if (!where) where = {};
      const user = this.$store.state.auth.user.op;
      where['h.userId'] = user.id;
    }
    // ok
    return {
      atomClass,
      where,
      order: 'desc',
      items: [],
      moduleStyle: null,
      rightDeleteComment: false,
    };
  },
  computed: {
    user() {
      return this.$store.state.auth.user.op;
    },
  },
  created() {
    // check function right
    const functions = [{
      module: 'a-base',
      name: 'deleteComment',
    }];
    this.$api.post('function/check', {
      functions,
    }).then(data => {
      this.rightDeleteComment = data[0].passed;
      // markdown style
      this.$meta.module.use(this.$meta.config.markdown.style.module, module => {
        this.moduleStyle = module;
      });
    });
  },
  mounted() {
    this.$meta.eventHub.$on('comment:action', this.onCommentChanged);
  },
  beforeDestroy() {
    this.$meta.eventHub.$off('comment:action', this.onCommentChanged);
  },
  methods: {
    onRefresh(done) {
      done();
      this.reload();
    },
    onInfinite() {
      this.$refs.loadMore.loadMore();
    },
    onLoadClear(done) {
      this.items = [];
      done();
    },
    onLoadMore({ index }) {
      // options
      const options = {
        orders: [
          ['h_updatedAt', this.order],
        ],
        page: { index },
      };
      // where
      if (this.where) {
        options.where = this.where;
      }
      // fetch
      return this.$api.post('comment/all', {
        atomClass: this.atomClass,
        options,
      }).then(data => {
        this.items = this.items.concat(data.list);
        return data;
      });
    },
    reload() {
      this.$refs.loadMore.reload();
    },
    onPerformDelete(event, item) {
      // delete
      return this.$view.dialog.confirm().then(() => {
        return this.$api.post('comment/delete', {
          key: { atomId: item.atomId },
          data: { commentId: item.h_id },
        }).then(data => {
          this.$meta.eventHub.$emit('comment:action', data);
          return true;
        });
      });
    },
    onPerformHeart(event, item) {
      // anonymous
      if (this.user.anonymous) {
        this.$view.dialog.confirm(this.$text('Please Sign In')).then(() => {
          // login
          this.$meta.vueLayout.openLogin();
        });
        return;
      }
      //
      return this.$api.post('comment/heart', {
        key: { atomId: item.atomId },
        data: { commentId: item.h_id, heart: item.h_heart ? 0 : 1 },
      }).then(data => {
        this.$meta.eventHub.$emit('comment:action', data);
      });
    },
    onCommentChanged(data) {
      const action = data.action;
      const atomId = data.atomId;
      const commentId = data.commentId;
      // create
      if (action === 'create') {
        this.reload();
        return;
      }
      // delete
      const index = this.items.findIndex(item => item.h_id === commentId);
      if (action === 'delete') {
        if (index !== -1) {
          this.items.splice(index, 1);
        }
        return;
      }
      // others
      if (index !== -1) {
        this.$api.post('comment/item', {
          key: { atomId },
          data: { commentId },
        }).then(data => {
          const _item = this.items[index];
          for (const key of Object.keys(data)) {
            _item[`h_${key}`] = data[key];
          }
        });
      }
    },
    onPerformSort() {
      this.order = this.order === 'desc' ? 'asc' : 'desc';
      this.reload();
    },
    onPerformViewAtom(event, item) {
      const _action = this.getAction({
        module: item.module,
        atomClassName: item.atomClassName,
        name: 'read',
      });
      if (!_action) return;
      return this.$meta.util.performAction({ ctx: this, action: _action, item });
    },
    getItemMedia(item) {
      const media = item.h_avatar || this.$meta.config.modules['a-base'].user.avatar.default;
      return this.$meta.util.combineImageUrl(media, 32);
    },
  },
};

</script>
