const require3 = require('require3');
const mparse = require3('egg-born-mparse').default;
const modelAtomFn = require('../../../model/atom.js');
const modelAtomStarFn = require('../../../model/atomStar.js');
const modelAtomLabelFn = require('../../../model/atomLabel.js');
const modelAtomLabelRefFn = require('../../../model/atomLabelRef.js');
const sqlProcedureFn = require('../../sql/procedure.js');

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
      this._sqlProcedure = null;
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

    get sqlProcedure() {
      if (!this._sqlProcedure) this._sqlProcedure = new (sqlProcedureFn(ctx))();
      return this._sqlProcedure;
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
    async create({ atomClass, roleIdOwner, item, user }) {
      // atomClass
      atomClass = await ctx.meta.atomClass.get(atomClass);
      // item
      item = item || { };
      if (!item.atomName) {
        // draftId
        const draftId = await this.sequence.next('draft');
        item.atomName = `${ctx.text('Draft')}-${draftId}`;
      }
      item.roleIdOwner = roleIdOwner;
      const atomId = await this._add({
        atomClass,
        atom: item,
        user,
      });

      // add item
      const _moduleInfo = mparse.parseInfo(atomClass.module);
      const res = await ctx.performAction({
        method: 'post',
        url: `/${_moduleInfo.url}/${atomClass.atomClassName}/create`,
        body: {
          atomClass,
          roleIdOwner,
          key: { atomId },
          item,
          user,
        },
      });
      const itemId = res.itemId;

      // save itemId
      const atomFlow = item.atomFlow === undefined ? atomClass.flow : item.atomFlow;
      await this._update({
        atom: {
          id: atomId,
          itemId,
          atomName: item.atomName,
          atomFlow,
        },
        user,
      });

      return { atomId, itemId };
    }

    // read
    async read({ key, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      const _atomClass = await ctx.meta.atomClass.atomClass(atomClass);
      // get
      const item = await this._get({
        atom: {
          id: key.atomId,
          tableName: _atomClass.tableNameFull || _atomClass.tableName,
        },
        user,
      });
      if (!item) return null;

      // itemId
      key.itemId = item.id;

      // read item
      const _moduleInfo = mparse.parseInfo(atomClass.module);
      await ctx.performAction({
        method: 'post',
        url: `/${_moduleInfo.url}/${atomClass.atomClassName}/read`,
        body: {
          atomClass,
          key,
          item,
          user,
        },
      });

      return item;
    }

    // count
    async count({ atomClass, options, user }) {
      return await this.select({ atomClass, options, user, count: 1 });
    }

    // select
    async select({ atomClass, options, user, pageForce = true, count = 0 }) {
      // atomClass
      let _atomClass;
      if (atomClass) {
        atomClass = await ctx.meta.atomClass.get(atomClass);
        _atomClass = await ctx.meta.atomClass.atomClass(atomClass);
      }
      // tableName
      let tableName = '';
      if (_atomClass) {
        tableName = this._getTableName({ atomClass: _atomClass, mode: options.mode });
        // 'where' should append atomClassId, such as article/post using the same table
        if (!options.where) options.where = {};
        options.where.atomClassId = atomClass.id;
      }
      // select
      const items = await this._list({
        tableName,
        options,
        user,
        pageForce,
        count,
      });

      // select items
      if (!count && atomClass) {
        const _moduleInfo = mparse.parseInfo(atomClass.module);
        await ctx.performAction({
          method: 'post',
          url: `/${_moduleInfo.url}/${atomClass.atomClassName}/select`,
          body: {
            atomClass,
            options,
            items,
            user,
          },
        });
      }

      return items;
    }

    // write
    async write({ key, item, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });

      // validator
      const validator = await ctx.meta.atom.validator({ atomClass, user });
      if (validator) {
        // if error throw 422
        await ctx.meta.validation.validate({
          module: validator.module,
          validator: validator.validator,
          schema: validator.schema,
          data: item,
        });
      }

      // write item
      const _moduleInfo = mparse.parseInfo(atomClass.module);
      await ctx.performAction({
        method: 'post',
        url: `/${_moduleInfo.url}/${atomClass.atomClassName}/write`,
        body: {
          atomClass,
          key,
          item,
          user,
        },
      });

      // write atom only after item writed
      await this._writeAtom({ key, item, user });
    }

    async _writeAtom({ key, item, user }) {
      // write atom
      if (item) {
        const atom = { };
        if (item.atomName !== undefined) atom.atomName = item.atomName;
        if (item.allowComment !== undefined) atom.allowComment = item.allowComment;
        if (Object.keys(atom).length > 0) {
          atom.id = key.atomId;
          await this._update({
            atom,
            user,
          });
        }
      }
    }

    // delete
    async delete({ key, user }) {
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      // delete item
      const _moduleInfo = mparse.parseInfo(atomClass.module);
      await ctx.performAction({
        method: 'post',
        url: `/${_moduleInfo.url}/${atomClass.atomClassName}/delete`,
        body: {
          atomClass,
          key,
          user,
        },
      });

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
      const _moduleInfo = mparse.parseInfo(atomClass.module);
      return await ctx.performAction({
        method: 'post',
        url: `/${_moduleInfo.url}/${atomClass.atomClassName}/action`,
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
      if (res.affectedRows !== 1) ctx.throw.module(moduleInfo.relativeName, 1003);
      _atom.atomEnabled = atomEnabled;
      // enable item
      const atomClass = await ctx.meta.atomClass.getByAtomId({ atomId: key.atomId });
      const _moduleInfo = mparse.parseInfo(atomClass.module);
      await ctx.performAction({
        method: 'post',
        url: `/${_moduleInfo.url}/${atomClass.atomClassName}/enable`,
        body: {
          atomClass,
          key,
          atom: _atom,
          user,
        },
      });
    }

    // atom other functions

    async get({ atomId }) {
      return await this.modelAtom.get({ id: atomId });
    }

    async flag({ key, atom: { atomFlag }, user }) {
      const res = await this.modelAtom.update({
        id: key.atomId,
        atomFlag,
        userIdUpdated: user.id,
      });
      if (res.affectedRows !== 1) ctx.throw.module(moduleInfo.relativeName, 1003);
    }

    async flow({ key, atom: { atomFlow }, user }) {
      const res = await this.modelAtom.update({
        id: key.atomId,
        atomFlow,
        userIdUpdated: user.id,
      });
      if (res.affectedRows !== 1) ctx.throw.module(moduleInfo.relativeName, 1003);
    }

    async star({ key, atom: { star = 1 }, user }) {
      let diff = 0;
      // check if exists
      const _star = await this.modelAtomStar.get({
        userId: user.id,
        atomId: key.atomId,
      });
      if (_star && !star) {
        diff = -1;
        // delete
        await this.modelAtomStar.delete({
          id: _star.id,
        });
      } else if (!_star && star) {
        diff = 1;
        // new
        await this.modelAtomStar.insert({
          userId: user.id,
          atomId: key.atomId,
          star: 1,
        });
      }
      // get
      const atom = await this.get({ atomId: key.atomId });
      let starCount = atom.starCount;
      if (diff !== 0) {
        starCount += diff;
        await this.modelAtom.update({
          id: key.atomId,
          starCount,
          // userIdUpdated: user.id,
        });
      }
      // ok
      return { star, starCount };
    }

    async readCount({ key, atom: { readCount = 1 }, user }) {
      await this.modelAtom.query('update aAtom set readCount = readCount + ? where iid=? and id=?',
        [ readCount, ctx.instance.id, key.atomId ]);
    }

    async comment({ key, atom: { comment = 1 }, user }) {
      await this.modelAtom.query('update aAtom set commentCount = commentCount + ? where iid=? and id=?',
        [ comment, ctx.instance.id, key.atomId ]);
    }

    async attachment({ key, atom: { attachment = 1 }, user }) {
      await this.modelAtom.query('update aAtom set attachmentCount = attachmentCount + ? where iid=? and id=?',
        [ attachment, ctx.instance.id, key.atomId ]);
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

    async schema({ atomClass, schema, user }) {
      const validator = await this.validator({ atomClass, user });
      if (!validator) return null;
      const _schema = ctx.meta.validation.getSchema({ module: validator.module, validator: validator.validator, schema });
      return {
        module: validator.module,
        validator: validator.validator,
        schema: _schema,
      };
    }

    async validator({ atomClass: { id }, user }) {
      let atomClass = await this.atomClass.get({ id });
      atomClass = await this.atomClass.top(atomClass);
      return await this.atomClass.validator({ atomClass, user });
    }

    // atom

    async _add({
      atomClass: { id, atomClassName, atomClassIdParent = 0 },
      atom: { itemId, atomName, atomFlag = 0, atomFlow = 0, roleIdOwner = 0 },
      user,
    }) {
      let atomClassId = id;
      if (!atomClassId) atomClassId = await this.getAtomClassId({ atomClassName, atomClassIdParent });
      const res = await this.modelAtom.insert({
        atomEnabled: 0, // must be enabled by enable
        atomFlag,
        atomFlow,
        itemId,
        atomClassId,
        atomName,
        userIdCreated: user.id,
        userIdUpdated: user.id,
        roleIdOwner,
      });
      return res.insertId;
    }

    async _update({
      atom: { id, atomName, allowComment, atomFlow, itemId },
      user,
    }) {
      const params = { id, userIdUpdated: user.id };
      if (atomName !== undefined) params.atomName = atomName;
      if (allowComment !== undefined) params.allowComment = allowComment;
      if (atomFlow !== undefined) params.atomFlow = atomFlow;
      if (itemId !== undefined) params.itemId = itemId;
      params.updatedAt = new Date();
      const res = await this.modelAtom.update(params);
      if (res.affectedRows !== 1) ctx.throw.module(moduleInfo.relativeName, 1003);
    }

    async _delete({
      atom,
      user,
    }) {
      await this._update({ atom, user });
      await this.modelAtom.delete(atom);
    }

    async _get({
      atom: { id, tableName },
      user,
    }) {
      const sql = this.sqlProcedure.getAtom({
        iid: ctx.instance.id,
        userIdWho: user ? user.id : 0,
        tableName, atomId: id,
      });
      return await ctx.model.queryOne(sql);
    }

    async _list({ tableName, options: { where, orders, page, star = 0, label = 0, comment = 0, file = 0 }, user, pageForce = true, count = 0 }) {
      page = ctx.meta.util.page(page, pageForce);

      const sql = this.sqlProcedure.selectAtoms({
        iid: ctx.instance.id,
        userIdWho: user ? user.id : 0,
        tableName, where, orders, page,
        star, label, comment, file, count,
      });
      const res = await ctx.model.query(sql);
      return count ? res[0]._count : res;
    }

    // right

    async checkRoleRightRead({
      atom: { id },
      roleId,
    }) {
      const res = await ctx.model.query('call aCheckRoleRightRead(?,?,?)',
        [ ctx.instance.id, roleId, id ]
      );
      return res[0][0];
    }

    async checkRightRead({
      atom: { id },
      user,
    }) {
      const sql = this.sqlProcedure.checkRightRead({
        iid: ctx.instance.id,
        userIdWho: user.id,
        atomId: id,
      });
      return await ctx.model.queryOne(sql);
    }

    async checkRightUpdate({
      atom: { id, action },
      user,
    }) {
      const actionFlag = await ctx.meta.atomAction.getFlagByAtomId({ atomId: id, code: action });
      const sql = this.sqlProcedure.checkRightUpdate({
        iid: ctx.instance.id,
        userIdWho: user.id,
        atomId: id,
        action, actionFlag,
      });
      return await ctx.model.queryOne(sql);
    }

    async checkRightAction({
      atom: { id, action },
      user,
    }) {
      const actionFlag = await ctx.meta.atomAction.getFlagByAtomId({ atomId: id, code: action });
      const sql = this.sqlProcedure.checkRightAction({
        iid: ctx.instance.id,
        userIdWho: user.id,
        atomId: id,
        action, actionFlag,
      });
      return await ctx.model.queryOne(sql);
    }

    async checkRightCreate({
      atomClass: { id, module, atomClassName, atomClassIdParent = 0 },
      user,
    }) {
      if (!id) id = await this.getAtomClassId({ module, atomClassName, atomClassIdParent });
      const sql = this.sqlProcedure.checkRightCreate({
        iid: ctx.instance.id,
        userIdWho: user.id,
        atomClassId: id,
      });
      return await ctx.model.queryOne(sql);
    }

    async checkRightCreateRole({
      atomClass: { id, module, atomClassName, atomClassIdParent = 0 },
      roleIdOwner,
      user,
    }) {
      if (!roleIdOwner) return null;
      if (!id) id = await this.getAtomClassId({ module, atomClassName, atomClassIdParent });
      const sql = this.sqlProcedure.checkRightCreateRole({
        iid: ctx.instance.id,
        userIdWho: user.id,
        atomClassId: id,
        roleIdOwner,
      });
      return await ctx.model.queryOne(sql);
    }

    // preffered roles
    async preferredRoles({ atomClass, user }) {
      // atomClass
      atomClass = await ctx.meta.atomClass.get(atomClass);

      const roles = await ctx.model.query(
        `select a.*,b.userId,c.roleName as roleNameWho from aViewRoleRightAtomClass a
          inner join aUserRole b on a.roleIdWho=b.roleId
          left join aRole c on a.roleIdWho=c.id
          where a.iid=? and a.atomClassId=? and a.action=1 and b.userId=?
          order by a.roleIdWho desc`,
        [ ctx.instance.id, atomClass.id, user.id ]);
      return roles;
    }

    _upperCaseFirstChar(str) {
      if (!str) return '';
      return str.substring(0, 1).toUpperCase() + str.substring(1);
    }

    _getTableName({ atomClass, mode }) {
      mode = this._upperCaseFirstChar(mode);
      if (mode === 'Search') {
        return atomClass.tableNameSearch || atomClass.tableNameFull || atomClass.tableName;
      }
      // special: all = list + atomEnabled=0
      return atomClass[`tableName${mode}`] || atomClass.tableName;
    }

  }

  return Atom;
};
