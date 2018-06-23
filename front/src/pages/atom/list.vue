<template>
  <f7-page :page-content="false" tabs with-subnavbar>
    <eb-navbar :title="$text('Atom')" eb-back-link="Back">
      <f7-nav-right>
        <eb-link iconMaterial="search" @click.prevent="onSearch"></eb-link>
      </f7-nav-right>
      <f7-subnavbar>
        <f7-toolbar tabbar :scrollable="labels && Object.keys(labels).length>1">
          <f7-link :tab-link="`#${tabIdList}`" tab-link-active>{{$text('List')}}</f7-link>
          <f7-link :tab-link="`#${tabIdDrafts}`">{{$text('Drafts')}}</f7-link>
          <f7-link :tab-link="`#${tabIdStars}`">{{$text('Stars')}}</f7-link>
          <template v-if="labels">
            <f7-link v-for="key of Object.keys(labels)" :key="key" :tab-link="`#${tabIdLabels}_${key}`">{{labels[key].text}}</f7-link>
          </template>
        </f7-toolbar>
      </f7-subnavbar>
    </eb-navbar>
    <f7-tabs>
      <eb-tab-page-content :id="tabIdList" tab-active>
        <atoms slot="list" mode="list" :atomClass="atomClass"></atoms>
      </eb-tab-page-content>
      <eb-tab-page-content :id="tabIdDrafts">
        <atoms slot="list" mode="drafts" :atomClass="atomClass"></atoms>
      </eb-tab-page-content>
      <eb-tab-page-content :id="tabIdStars">
        <atoms slot="list" mode="stars" :atomClass="atomClass"></atoms>
      </eb-tab-page-content>
      <template v-if="labels">
        <eb-tab-page-content v-for="key of Object.keys(labels)" :key="key" :id="`${tabIdLabels}_${key}`">
          <atoms slot="list" :mode="`labels-${key}`" :atomClass="atomClass"></atoms>
        </eb-tab-page-content>
      </template>
    </f7-tabs>
  </f7-page>
</template>
<script>
import Vue from 'vue';
import atoms from '../../components/atom/list.vue';
export default {
  components: {
    atoms,
  },
  data() {
    return {
      tabIdList: Vue.prototype.$meta.util.nextId('tab'),
      tabIdDrafts: Vue.prototype.$meta.util.nextId('tab'),
      tabIdStars: Vue.prototype.$meta.util.nextId('tab'),
      tabIdLabels: Vue.prototype.$meta.util.nextId('tab'),
    };
  },
  computed: {
    labels() {
      return this.$local.state.labels;
    },
    atomClass() {
      if (!this.$f7Route.query.module || !this.$f7Route.query.atomClassName) return null;
      return {
        module: this.$f7Route.query.module,
        atomClassName: this.$f7Route.query.atomClassName
      };
    }
  },
  methods: {
    onSearch() {
      const atomClass = this.atomClass;
      let url = '/a/base/atom/search';
      if (atomClass) {
        url = `${url}?module=${atomClass.module}&atomClassName=${atomClass.atomClassName}`;
      }
      this.$view.navigate(url);
    },
  },
  created() {
    this.$local.dispatch('getLabels');
  },
};

</script>