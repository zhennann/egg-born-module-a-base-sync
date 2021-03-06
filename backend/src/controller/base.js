const require3 = require('require3');
const qr = require3('qr-image');

module.exports = app => {

  class BaseController extends app.Controller {

    modules() {
      const res = this.ctx.service.base.modules();
      this.ctx.success(res);
    }

    locales() {
      const res = this.ctx.service.base.locales();
      this.ctx.success(res);
    }

    atomClasses() {
      const res = this.ctx.service.base.atomClasses();
      this.ctx.success(res);
    }

    actions() {
      const res = this.ctx.service.base.actions();
      this.ctx.success(res);
    }

    flags() {
      const res = this.ctx.service.base.flags();
      this.ctx.success(res);
    }

    orders() {
      const res = this.ctx.service.base.orders();
      this.ctx.success(res);
    }

    menus() {
      const res = this.ctx.service.base.menus();
      this.ctx.success(res);
    }

    panels() {
      const res = this.ctx.service.base.panels();
      this.ctx.success(res);
    }

    widgets() {
      const res = this.ctx.service.base.widgets();
      this.ctx.success(res);
    }

    sections() {
      const res = this.ctx.service.base.sections();
      this.ctx.success(res);
    }

    buttons() {
      const res = this.ctx.service.base.buttons();
      this.ctx.success(res);
    }

    functions() {
      const res = this.ctx.service.base.functions();
      this.ctx.success(res);
    }

    themes() {
      const res = this.ctx.service.base.themes();
      this.ctx.success(res);
    }

    async performAction() {
      // params
      const params = JSON.parse(this.ctx.request.query.params);
      // force innerAccess as false
      params.innerAccess = false;
      // performAction
      const res = await this.ctx.performAction(params);
      this.ctx.success(res);
    }

    async qrcode() {
      const query = this.ctx.request.query;
      const img = qr.image(query.text || '', {
        type: query.type || 'png',
        size: query.size || 10,
        margin: query.margin || 4,
        ec_level: query.ec_level || 'M',
      });
      // ok
      this.ctx.status = 200;
      this.ctx.type = 'image/png';
      this.ctx.body = img;
    }

  }

  return BaseController;
};
