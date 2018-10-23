module.exports = app => {

  class CommentController extends app.Controller {

    async all() {
      const options = this.ctx.request.body.options;
      options.comment = 1;
      const res = await this.ctx.performAction({
        method: 'post',
        url: 'atom/select',
        body: {
          atomClass: this.ctx.request.body.atomClass,
          options,
        },
      });
      this.ctx.success(res);
    }

    async allP() {
      // data
      const data = JSON.parse(this.ctx.request.query.data);
      // select
      const res = await this.ctx.performAction({
        method: 'post',
        url: 'comment/all',
        body: data,
      });
      this.ctx.success(res);
    }

    async list() {
      const options = this.ctx.request.body.options;
      options.page = this.ctx.meta.util.page(options.page);
      const items = await this.ctx.service.comment.list({
        key: this.ctx.request.body.key,
        options,
        user: this.ctx.user.op,
      });
      this.ctx.successMore(items, options.page.index, options.page.size);
    }

    async listP() {
      // data
      const data = JSON.parse(this.ctx.request.query.data);
      // select
      const res = await this.ctx.performAction({
        method: 'post',
        url: 'comment/list',
        body: data,
      });
      this.ctx.success(res);
    }

    async item() {
      const res = await this.ctx.service.comment.item({
        key: this.ctx.request.body.key,
        data: this.ctx.request.body.data,
        user: this.ctx.user.op,
      });
      this.ctx.success(res);
    }

    async save() {
      const res = await this.ctx.service.comment.save({
        key: this.ctx.request.body.key,
        data: this.ctx.request.body.data,
        user: this.ctx.user.op,
      });
      this.ctx.success(res);
    }

    async delete() {
      const res = await this.ctx.service.comment.delete({
        key: this.ctx.request.body.key,
        data: this.ctx.request.body.data,
        user: this.ctx.user.op,
      });
      this.ctx.success(res);
    }

    async deleteP() {
      // data
      const data = JSON.parse(this.ctx.request.query.data);
      // delete
      const res = await this.ctx.performAction({
        method: 'post',
        url: 'comment/delete',
        body: data,
      });
      this.ctx.success(res);
    }

    async heart() {
      const res = await this.ctx.service.comment.heart({
        key: this.ctx.request.body.key,
        data: this.ctx.request.body.data,
        user: this.ctx.user.op,
      });
      this.ctx.success(res);
    }

    async heartP() {
      // data
      const data = JSON.parse(this.ctx.request.query.data);
      // heart
      const res = await this.ctx.performAction({
        method: 'post',
        url: 'comment/heart',
        body: data,
      });
      this.ctx.success(res);
    }

  }
  return CommentController;
};