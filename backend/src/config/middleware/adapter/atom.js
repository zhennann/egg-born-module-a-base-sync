const require3 = require('require3');
const mparse = require3('egg-born-mparse').default;
const modelAtomFn = require('../../../model/atom.js');
const modelAtomStarFn = require('../../../model/atomStar.js');
const modelAtomLabelFn = require('../../../model/atomLabel.js');
const modelAtomLabelRefFn = require('../../../model/atomLabelRef.js');

const Fn = module.exports = ctx => {
  const moduleInfo = ctx.app.meta.mockUtil.parseInfoFromPackage(__dirname);
  class Atom {

    constructor(moduleName) {
      this.moduleName = moduleName || ctx.module.info.relativeName;
      this._atomClass = null;
      this._modelAtom = null;
      this._modelAtomStar = null;
      this._modelAtomLabel = null;
      this._modelAtomLabelRef = null;
      this._sequence = null;
    }

    // other module's atom
    module(moduleName) {
      return new (Fn(ctx))(moduleName);
    }

    get atomClass() {
      if (!this._atomClass) this._atomClass = ctx.meta.atomClass.module(this.moduleName);
      return this._atomClass;
    }

    get modelAtom() {
      if (!this._modelAtom) this._modelAtom = new (modelAtomFn(ctx.app))(ctx);
      return this._modelAtom;
    }

    get modelAtomStar() {
      if (!this._modelAtomStar) this._modelAtomStar = new (modelAtomStarFn(ctx.app))(ctx);
      return this._modelAtomStar;
    }

    get modelAtomLabel() {
      if (!this._modelAtomLabel) this._modelAtomLabel = new (modelAtomLabelFn(ctx.app))(ctx);
      return this._modelAtomLabel;
    }

    get modelAtomLabelRef() {
      if (!this._modelAtomLabelRef) this._modelAtomLabelRef = new (modelAtomLabelRefFn(ctx.app))(ctx);
      return this._modelAtomLabelRef;
    }

    get sequence() {
      if (!this._sequence) this._sequence = ctx.meta.sequence.module(moduleInfo.relativeName);
      return this._sequence;
    }

    async getAtomClassId({ module, atomClassName, atomClassIdParent = 0 }) {
      const res = await this.atomClass.get({
        module,
        atomClassName,
        atomClassIdParent,
      });
      return res.id;
    }

    // atom and item

    // create
    async create({ atomClass, user }) {
      // sequence
      const sequence = await this.sequence.next('draft');
      // atom
      const atom = { atomName: `${ctx.text('Draft')}-${sequence}` };
      // atomClass
      atomClass = await ctx.meta.atomClass.get(atomClass);
      const atomId = await this._add({
        atomClass,
        atom,
        user,
      });

      // add item
      const moduleInfo = mparse.parseInfo(atomClass.module);
      const res = await ctx.performAction({
        method: 'post',
        url: `/${moduleInfo.url}/${atomClass.atomClassName}/create`,
        body: {
          atomClass,
          key: { atomId },
          atom,
          user,
        },
      });
      const itemId = res.itemId;

      // save itemId
      await this._update({
        atom: {
          id: atomId,
          itemId,
        },
        user,
      });

      return { atomId, itemId };
    }

    // read
    async read({ key, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      const _atomClass = await ctx.meta.atomClass.atomClass(atomClass);
      const item = await this._get({
        atom: {
          id: key.atomId,
          tableName: _atomClass.tableName,
        },
        user,
      });
      if (!item) return null;

      // itemId
      key.itemId = item.id;

      // read item
      const moduleInfo = mparse.parseInfo(atomClass.module);
      try {
        await ctx.performAction({
          method: 'post',
          url: `/${moduleInfo.url}/${atomClass.atomClassName}/read`,
          body: {
            atomClass,
            key,
            item,
            user,
          },
        });
      } catch (e) {
        if (e.code !== 404) throw e;
      }

      return item;
    }

    // select
    async select({ atomClass, options, user }) {
      // atomClass
      let _atomClass;
      if (atomClass) {
        atomClass = await ctx.meta.atomClass.get(atomClass);
        _atomClass = await ctx.meta.atomClass.atomClass(atomClass);
      }
      // select
      const items = await this._list({
        tableName: _atomClass ? _atomClass.tableName : '',
        options,
        user,
      });

      // select items
      if (atomClass) {
        const moduleInfo = mparse.parseInfo(atomClass.module);
        try {
          await ctx.performAction({
            method: 'post',
            url: `/${moduleInfo.url}/${atomClass.atomClassName}/select`,
            body: {
              atomClass,
              options,
              items,
              user,
            },
          });
        } catch (e) {
          if (e.code !== 404) throw e;
        }
      }

      return items;
    }

    // write
    async write({ key, item, validation, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      if (item && item.atomName !== undefined) {
        await this._update({
          atom: {
            id: key.atomId,
            atomName: item.atomName,
          },
          user,
        });
      }

      // write item
      const moduleInfo = mparse.parseInfo(atomClass.module);
      await ctx.performAction({
        method: 'post',
        url: `/${moduleInfo.url}/${atomClass.atomClassName}/write`,
        body: {
          atomClass,
          key,
          item,
          validation,
          user,
        },
      });
    }

    // delete
    async delete({ key, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      // delete item
      const moduleInfo = mparse.parseInfo(atomClass.module);
      try {
        await ctx.performAction({
          method: 'post',
          url: `/${moduleInfo.url}/${atomClass.atomClassName}/delete`,
          body: {
            atomClass,
            key,
            user,
          },
        });
      } catch (e) {
        if (e.code !== 404) throw e;
      }

      // delete atom and item
      await this._delete({
        atom: {
          id: key.atomId,
        },
        user,
      });
    }

    // action
    async action({ action, key, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      const moduleInfo = mparse.parseInfo(atomClass.module);
      return await ctx.performAction({
        method: 'post',
        url: `/${moduleInfo.url}/${atomClass.atomClassName}/action`,
        body: {
          action,
          atomClass,
          key,
          user,
        },
      });
    }

    async enable({ key, atom: { atomEnabled = 1 }, user }) {
      const _atom = await this.modelAtom.get({ id: key.atomId });
      if (_atom.atomEnabled === atomEnabled) return;
      // update
      const res = await this.modelAtom.update({
        id: key.atomId,
        atomEnabled,
        userIdUpdated: user.id,
      });
      if (res.affectedRows !== 1) ctx.throw(1003);
      _atom.atomEnabled = atomEnabled;
      // enable item
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      const moduleInfo = mparse.parseInfo(atomClass.module);
      try {
        await ctx.performAction({
          method: 'post',
          url: `/${moduleInfo.url}/${atomClass.atomClassName}/enable`,
          body: {
            atomClass,
            key,
            atom: _atom,
            user,
          },
        });
      } catch (e) {
        if (e.code !== 404) throw e;
      }
    }

    // atom other functions

    async flag({ key, atom: { atomFlag }, user }) {
      const res = await this.modelAtom.update({
        id: key.atomId,
        atomFlag,
        userIdUpdated: user.id,
      });
      if (res.affectedRows !== 1) ctx.throw(1003);
    }

    async star({ key, atom: { star = 1 }, user }) {
      // force delete
      await this.modelAtomStar.delete({
        userId: user.id,
        atomId: key.atomId,
      });
      // new
      if (star) {
        await this.modelAtomStar.insert({
          userId: user.id,
          atomId: key.atomId,
          star: 1,
        });
      }
    }

    async labels({ key, atom: { labels = null }, user }) {
      // force delete
      await this.modelAtomLabel.delete({
        userId: user.id,
        atomId: key.atomId,
      });
      await this.modelAtomLabelRef.delete({
        userId: user.id,
        atomId: key.atomId,
      });
      // new
      if (labels && labels.length > 0) {
        await this.modelAtomLabel.insert({
          userId: user.id,
          atomId: key.atomId,
          labels: JSON.stringify(labels),
        });
        for (const labelId of labels) {
          await this.modelAtomLabelRef.insert({
            userId: user.id,
            atomId: key.atomId,
            labelId,
          });
        }
      }
    }

    async actions({ key, basic, user }) {
      // atomClass
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      // actions
      const _basic = basic ? 'and a.code<100' : '';
      const sql = `
        select a.*,b.module,b.atomClassName from aAtomAction a 
          left join aAtomClass b on a.atomClassId=b.id 
            where a.iid=? and a.deleted=0 and a.atomClassId=? ${_basic}
              order by a.code asc
      `;
      const actions = await ctx.model.query(sql, [ ctx.instance.id, atomClass.id ]);
      // actions res
      const actionsRes = [];
      const _actionsSystem = ctx.constant.module(moduleInfo.relativeName).atom.action;
      for (const action of actions) {
        if (action.code === _actionsSystem.write || action.code === _actionsSystem.delete) {
          const res = await this.checkRightUpdate({ atom: { id: key.atomId, action: action.code }, user });
          if (res) actionsRes.push(action);
        } else if (action.code > _actionsSystem.custom) {
          const res = await this.checkRightAction({ atom: { id: key.atomId, action: action.code }, user });
          if (res) actionsRes.push(action);
        }
      }
      return actionsRes;
    }

    async schema({ atomClass, schema }) {
      const validator = await this.validator({ atomClass });
      if (!validator) return null;
      const _schema = ctx.meta.validation.getSchema({ module: validator.module, validator: validator.validator, schema });
      return {
        module: validator.module,
        validator: validator.validator,
        schema: _schema,
      };
    }

    async validator({ atomClass: { id } }) {
      let atomClass = await this.atomClass.get({ id });
      atomClass = await this.atomClass.top(atomClass);
      return this.atomClass.validator(atomClass);
    }

    // atom

    async _add({
      atomClass: { id, atomClassName, atomClassIdParent = 0 },
      atom: { itemId, atomName, atomFlag = 0 },
      user,
    }) {
      let atomClassId = id;
      if (!atomClassId) atomClassId = await this.getAtomClassId({ atomClassName, atomClassIdParent });
      const res = await this.modelAtom.insert({
        atomEnabled: 0, // must be enabled by enable
        atomFlag,
        itemId,
        atomClassId,
        atomName,
        userIdCreated: user.id,
        userIdUpdated: user.id,
      });
      return res.insertId;
    }

    async _update({
      atom: { id, atomName, itemId },
      user,
    }) {
      const params = { id, userIdUpdated: user.id };
      if (atomName !== undefined) params.atomName = atomName;
      if (itemId !== undefined) params.itemId = itemId;
      const res = await this.modelAtom.update(params);
      if (res.affectedRows !== 1) ctx.throw(1003);
    }

    async _delete({
      atom,
      user,
    }) {
      await this._update({ atom, user });
      await this.modelAtom.delete(atom);
    }

    async _get({
      atom: { id, tableName = '' },
      user,
    }) {
      const res = await ctx.model.query('call aGetAtom(?,?,?,?)',
        [ tableName, id, ctx.instance.id, user.id ]
      );
      return res[0][0];
    }

    async _list({ tableName = '', options: { where, orders, page, star = 0, label = 0 }, user }) {
      page = ctx.meta.util.page(page);

      const _where = ctx.model._where2(where);
      const _orders = ctx.model._orders(orders);
      const _limit = ctx.model._limit(page.size, page.index);

      const res = await ctx.model.query('call aSelectAtoms(?,?,?,?,?,?,?,?)',
        [ tableName, _where, _orders, _limit, ctx.instance.id, user.id, star, label ]
      );
      return res[0];
    }

    // right

    async checkRightRead({
      atom: { id },
      user,
    }) {
      const res = await ctx.model.query('call aCheckRightRead(?,?,?)',
        [ ctx.instance.id, user.id, id ]
      );
      return res[0][0];
    }

    async checkRightUpdate({
      atom: { id, action },
      user,
    }) {
      const actionFlag = await ctx.meta.atomAction.getFlagByAtomId({ atomId: id, code: action });
      const res = await ctx.model.query('call aCheckRightUpdate(?,?,?,?,?)',
        [ ctx.instance.id, user.id, id, action, actionFlag ]
      );
      return res[0][0];
    }

    async checkRightAction({
      atom: { id, action },
      user,
    }) {
      const actionFlag = await ctx.meta.atomAction.getFlagByAtomId({ atomId: id, code: action });
      const res = await ctx.model.query('call aCheckRightAction(?,?,?,?,?)',
        [ ctx.instance.id, user.id, id, action, actionFlag ]
      );
      return res[0][0];
    }

    async checkRightCreate({
      atomClass: { id, module, atomClassName, atomClassIdParent = 0 },
      user,
    }) {
      if (!id) id = await this.getAtomClassId({ module, atomClassName, atomClassIdParent });
      const res = await ctx.model.query('call aCheckRightCreate(?,?,?)',
        [ ctx.instance.id, user.id, id ]
      );
      return res[0][0];
    }

  }

  return Atom;
};