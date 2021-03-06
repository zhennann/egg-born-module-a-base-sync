const modelFn = require('../../../model/role.js');
const modelRoleIncFn = require('../../../model/roleInc.js');
const modelUserRoleFn = require('../../../model/userRole.js');
const modelRoleRightFn = require('../../../model/roleRight.js');
const modelRoleRightRefFn = require('../../../model/roleRightRef.js');
const modelFunctionFn = require('../../../model/function.js');
const modelRoleFunctionFn = require('../../../model/roleFunction.js');

const Fn = module.exports = ctx => {
  const moduleInfo = ctx.app.meta.mockUtil.parseInfoFromPackage(__dirname);
  class Role {

    constructor(moduleName) {
      this.moduleName = moduleName || ctx.module.info.relativeName;
      this._model = null;
      this._modelRoleInc = null;
      this._modelUserRole = null;
      this._modelRoleRight = null;
      this._modelRoleRightRef = null;
      this._modelFunction = null;
      this._modelRoleFunction = null;
    }

    // other module's role
    module(moduleName) {
      return new (Fn(ctx))(moduleName);
    }

    get model() {
      if (!this._model) this._model = new (modelFn(ctx.app))(ctx);
      return this._model;
    }

    get modelRoleInc() {
      if (!this._modelRoleInc) this._modelRoleInc = new (modelRoleIncFn(ctx.app))(ctx);
      return this._modelRoleInc;
    }

    get modelUserRole() {
      if (!this._modelUserRole) this._modelUserRole = new (modelUserRoleFn(ctx.app))(ctx);
      return this._modelUserRole;
    }

    get modelRoleRight() {
      if (!this._modelRoleRight) this._modelRoleRight = new (modelRoleRightFn(ctx.app))(ctx);
      return this._modelRoleRight;
    }

    get modelRoleRightRef() {
      if (!this._modelRoleRightRef) this._modelRoleRightRef = new (modelRoleRightRefFn(ctx.app))(ctx);
      return this._modelRoleRightRef;
    }

    get modelFunction() {
      if (!this._modelFunction) this._modelFunction = new (modelFunctionFn(ctx.app))(ctx);
      return this._modelFunction;
    }

    get modelRoleFunction() {
      if (!this._modelRoleFunction) this._modelRoleFunction = new (modelRoleFunctionFn(ctx.app))(ctx);
      return this._modelRoleFunction;
    }

    async get(where) {
      return await this.model.get(where);
    }

    async getSystemRole({ roleName }) {
      return await this.get({
        roleName,
        system: 1,
      });
    }

    // add role
    async add({ roleName = '', leader = 0, catalog = 0, system = 0, sorting = 0, roleIdParent = 0 }) {
      const res = await this.model.insert({
        roleName,
        leader,
        catalog,
        system,
        sorting,
        roleIdParent,
      });
      const roleId = res.insertId;

      // set dirty
      await this.setDirty(true);

      return roleId;
    }

    async move({ roleId, roleIdParent }) {
      // role
      const role = await this.get({ id: roleId });
      if (role.roleIdParent === roleIdParent) return;

      // update
      await this.model.update({ id: roleId, roleIdParent });

      // set dirty
      await this.setDirty(true);
    }

    async delete({ roleId, force = false }) {
      // role
      const role = await this.get({ id: roleId });

      // check if system
      if (role.system) ctx.throw(403);
      // check if children
      if (role.catalog && !force) {
        const children = await this.children({ roleId });
        if (children.length > 0) ctx.throw.module(moduleInfo.relativeName, 1008);
      }

      // delete all includes
      await this.modelRoleInc.delete({ roleId });
      await this.modelRoleInc.delete({ roleIdInc: roleId });

      // delete all users
      await this.modelUserRole.delete({ roleId });

      // delete all atom rights
      await this.modelRoleRight.delete({ roleId });
      await this.modelRoleRightRef.delete({ roleId });

      // delete all function rights
      await this.modelRoleFunction.delete({ roleId });

      // delete this
      await this.model.delete({ id: roleId });

      // set dirty
      await this.setDirty(true);
    }

    // add role include
    async addRoleInc({ roleId, roleIdInc }) {
      const res = await this.modelRoleInc.insert({
        roleId,
        roleIdInc,
      });
      const id = res.insertId;

      // set dirty
      await this.setDirty(true);

      return id;
    }

    // remove role include
    async removeRoleInc({ id }) {
      await this.modelRoleInc.delete({ id });

      // set dirty
      await this.setDirty(true);
    }

    // add user role
    async addUserRole({ userId, roleId }) {
      const res = await this.modelUserRole.insert({
        userId, roleId,
      });
      return res.insertId;
    }

    async deleteUserRole({ id, userId, roleId }) {
      if (!id) {
        const item = await this.modelUserRole.get({
          userId, roleId,
        });
        if (!item) return;
        id = item.id;
      }
      await this.modelUserRole.delete({ id });
    }

    async deleteAllUserRoles({ userId }) {
      await this.modelUserRole.delete({ userId });
    }

    // add role right
    async addRoleRight({ roleId, atomClassId, action, scope }) {
      if (scope) {
        if (typeof scope === 'string') {
          scope = scope.split(',');
        } else if (!Array.isArray(scope)) {
          scope = [ scope ];
        }
      }
      // force action exists in db
      await ctx.meta.atomAction.get({ atomClassId, code: action });

      // roleRight
      const res = await this.modelRoleRight.insert({
        roleId,
        atomClassId,
        action,
        scope: JSON.stringify(scope),
      });
      const roleRightId = res.insertId;
      // roleRightRef
      if (scope) {
        for (const roleIdScope of scope) {
          await this.modelRoleRightRef.insert({
            roleRightId,
            roleId,
            atomClassId,
            action,
            roleIdScope,
          });
        }
      }
      // insert into roleFunction if action=create/read
      const constant = ctx.constant.module(moduleInfo.relativeName);
      if (action === constant.atom.action.create || action === constant.atom.action.read) {
        const atomClass = await ctx.meta.atomClass.get({ id: atomClassId });
        const functions = ctx.meta.base.functionsAutoRight({
          module: atomClass.module,
          atomClassName: atomClass.atomClassName,
          action });
        for (const key in functions) {
          const func = await ctx.meta.function.get({ module: atomClass.module, name: functions[key].name });
          await this.addRoleFunction({
            roleId,
            functionId: func.id,
            roleRightId,
          });
        }
      }

      return roleRightId;
    }

    // delete role right
    async deleteRoleRight({ id }) {
      await this.modelRoleRight.delete({ id });
      await this.modelRoleRightRef.delete({ roleRightId: id });
      await this.modelRoleFunction.delete({ roleRightId: id });
    }

    // add role function
    async addRoleFunction({ roleId, functionId, roleRightId = 0 }) {
      await this.modelRoleFunction.insert({
        roleId,
        functionId,
        roleRightId,
      });
    }

    // delete role function
    async deleteRoleFunction({ id }) {
      await this.modelRoleFunction.delete({ id });
    }

    // children
    async children({ roleId, page }) {
      page = ctx.meta.util.page(page, false);
      // roleId
      if (!roleId || roleId === 'root') {
        roleId = 0;
      }
      // select
      const options = {
        where: { roleIdParent: roleId },
        orders: [[ 'sorting', 'asc' ], [ 'roleName', 'asc' ]],
      };
      if (page.size !== 0) {
        options.limit = page.size;
        options.offset = page.index;
      }
      return await this.model.select(options);
    }

    // save
    async save({ roleId, data: { roleName, leader, sorting, catalog } }) {
      const role = await this.get({ id: roleId });
      if (roleName !== undefined) role.roleName = roleName;
      if (leader !== undefined) role.leader = leader;
      if (sorting !== undefined) role.sorting = sorting;
      if (catalog !== undefined) role.catalog = catalog;
      await this.model.update(role);
    }

    // includes
    async includes({ roleId, page }) {
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      return await ctx.model.query(`
        select a.*,b.roleName from aRoleInc a
          left join aRole b on a.roleIdInc=b.id
            where a.iid=? and a.roleId=?
            ${_limit}
        `, [ ctx.instance.id, roleId ]);
    }

    // role rights
    async roleRights({ roleId, page }) {
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      const list = await ctx.model.query(`
        select a.*,b.module,b.atomClassName,c.name as actionName from aRoleRight a
          left join aAtomClass b on a.atomClassId=b.id
          left join aAtomAction c on a.atomClassId=c.atomClassId and a.action=c.code
            where a.iid=? and a.roleId=?
            order by b.module,a.atomClassId,a.action
            ${_limit}
        `, [ ctx.instance.id, roleId ]);
      // scope
      for (const item of list) {
        const scope = JSON.parse(item.scope);
        item.scopeRoles = await this._scopeRoles({ scope });
      }
      return list;
    }

    // role spreads
    async roleSpreads({ roleId, page }) {
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      const list = await ctx.model.query(`
        select d.*,d.id as roleExpandId,a.id as roleRightId,a.scope,b.module,b.atomClassName,c.code as actionCode,c.name as actionName,e.roleName from aRoleRight a
          left join aAtomClass b on a.atomClassId=b.id
          left join aAtomAction c on a.atomClassId=c.atomClassId and a.action=c.code
          left join aRoleExpand d on a.roleId=d.roleIdBase
          left join aRole e on d.roleIdBase=e.id
            where d.iid=? and d.roleId=?
            order by b.module,a.atomClassId,a.action
            ${_limit}
        `, [ ctx.instance.id, roleId ]);
      // scope
      for (const item of list) {
        const scope = JSON.parse(item.scope);
        item.scopeRoles = await this._scopeRoles({ scope });
      }
      return list;
    }

    // atom rights of user
    async atomRightsOfUser({ userId, page }) {
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      const list = await ctx.model.query(`
        select a.*,b.module,b.atomClassName,c.code as actionCode,c.name as actionName,e.roleName from aViewUserRightAtomClass a
          left join aAtomClass b on a.atomClassId=b.id
          left join aAtomAction c on a.atomClassId=c.atomClassId and a.action=c.code
          left join aRole e on a.roleIdBase=e.id
            where a.iid=? and a.userIdWho=?
            order by b.module,a.atomClassId,a.action
            ${_limit}
        `, [ ctx.instance.id, userId ]);
      // scope
      for (const item of list) {
        const scope = JSON.parse(item.scope);
        item.scopeRoles = await this._scopeRoles({ scope });
      }
      return list;
    }

    async _scopeRoles({ scope }) {
      if (!scope || scope.length === 0) return null;
      return await ctx.model.query(`
            select a.* from aRole a
              where a.iid=? and a.id in (${scope.join(',')})
            `, [ ctx.instance.id ]);
    }

    // function rights
    async functionRights({ menu, roleId, page }) {
      // check locale
      const locale = ctx.locale;
      // list
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      const list = await ctx.model.query(`
        select a.*,b.module,b.name,b.title,b.sceneId,g.sceneName,b.sorting,f.titleLocale from aRoleFunction a
          left join aFunction b on a.functionId=b.id
          left join aFunctionLocale f on a.functionId=f.functionId
          left join aFunctionScene g on g.id=b.sceneId
            where a.iid=? and a.roleId=? and b.menu=? and f.locale=?
            order by b.module,g.sceneSorting,b.sorting
            ${_limit}
        `, [ ctx.instance.id, roleId, menu, locale ]);
      return list;
    }

    // function spreads
    async functionSpreads({ menu, roleId, page }) {
      // check locale
      const locale = ctx.locale;
      // list
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      const list = await ctx.model.query(`
        select d.*,d.id as roleExpandId,a.id as roleFunctionId,b.module,b.name,b.title,b.sceneId,g.sceneName,e.roleName,f.titleLocale from aRoleFunction a
          left join aFunction b on a.functionId=b.id
          left join aRoleExpand d on a.roleId=d.roleIdBase
          left join aRole e on d.roleIdBase=e.id
          left join aFunctionLocale f on a.functionId=f.functionId
          left join aFunctionScene g on g.id=b.sceneId
            where d.iid=? and d.roleId=? and b.menu=? and f.locale=?
            order by b.module,g.sceneSorting,b.sorting
            ${_limit}
        `, [ ctx.instance.id, roleId, menu, locale ]);
      return list;
    }

    // function rights of user
    async functionRightsOfUser({ menu, userId, page }) {
      // check locale
      const locale = ctx.locale;
      // list
      page = ctx.meta.util.page(page, false);
      const _limit = ctx.model._limit(page.size, page.index);
      const list = await ctx.model.query(`
        select a.*,b.module,b.name,b.title,b.sceneId,g.sceneName,b.sorting,f.titleLocale,e.roleName from aViewUserRightFunction a
          left join aFunction b on a.functionId=b.id
          left join aFunctionLocale f on a.functionId=f.functionId
          left join aFunctionScene g on g.id=b.sceneId
          left join aRole e on a.roleIdBase=e.id
            where a.iid=? and a.userIdWho=? and b.menu=? and f.locale=?
            order by b.module,g.sceneSorting,b.sorting
            ${_limit}
        `, [ ctx.instance.id, userId, menu, locale ]);

      return list;
    }

    async getUserRolesDirect({ userId }) {
      const list = await ctx.model.query(`
        select a.* from aRole a
          left join aUserRole b on a.id=b.roleId
            where a.iid=? and b.userId=?
        `, [ ctx.instance.id, userId ]);
      return list;
    }

    async getUserRolesParent({ userId }) {
      const list = await ctx.model.query(`
        select a.* from aRole a
          left join aViewUserRoleRef b on a.id=b.roleIdParent
            where a.iid=? and b.userId=?
        `, [ ctx.instance.id, userId ]);
      return list;
    }

    async getUserRolesExpand({ userId }) {
      const list = await ctx.model.query(`
        select a.* from aRole a
          left join aViewUserRoleExpand b on a.id=b.roleIdBase
            where a.iid=? and b.userId=?
        `, [ ctx.instance.id, userId ]);
      return list;
    }

    async userInRoleDirect({ userId, roleId }) {
      const list = await ctx.model.query(`
        select count(*) as count from aUserRole a
          where a.iid=? and a.userId=? and a.roleId=?
        `, [ ctx.instance.id, userId, roleId ]);
      return list[0].count > 0;
    }

    async userInRoleParent({ userId, roleId }) {
      const list = await ctx.model.query(`
        select count(*) as count from aViewUserRoleRef a
          where a.iid=? and a.userId=? and a.roleIdParent=?
        `, [ ctx.instance.id, userId, roleId ]);
      return list[0].count > 0;
    }

    async userInRoleExpand({ userId, roleId }) {
      const list = await ctx.model.query(`
        select count(*) as count from aViewUserRoleExpand a
          where a.iid=? and a.userId=? and a.roleIdBase=?
        `, [ ctx.instance.id, userId, roleId ]);
      return list[0].count > 0;
    }

    // set dirty
    async setDirty(dirty) {
      await ctx.meta.status.module(moduleInfo.relativeName).set('roleDirty', dirty);
    }

    async getDirty() {
      return await ctx.meta.status.module(moduleInfo.relativeName).get('roleDirty');
    }

    // build roles
    async build(options) {
      options = options || {};
      const progressId = options.progressId;
      // total
      let total;
      if (progressId) {
        total = await this.model.count();
      }
      // progress
      const progress = { progressId, total, progress: 0 };
      try {
        // iid
        const iid = ctx.instance.id;
        // remove
        await this._buildRolesRemove({ iid });
        // add
        await this._buildRolesAdd({ iid, roleIdParent: 0 }, progress);
        // setDirty
        await this.setDirty(false);
        // done
        if (progressId) {
          await ctx.meta.progress.done({ progressId });
        }
      } catch (err) {
        // error
        if (progressId) {
          await ctx.meta.progress.error({ progressId, message: err.message });
        }
        throw err;
      }
    }

    // const roleRights = [
    //   { roleName: 'cms-writer', action: 'create' },
    //   { roleName: 'cms-writer', action: 'write', scopeNames: 0 },
    //   { roleName: 'cms-writer', action: 'delete', scopeNames: 0 },
    //   { roleName: 'cms-writer', action: 'read', scopeNames: 'authenticated' },
    //   { roleName: 'cms-publisher', action: 'read', scopeNames: 'authenticated' },
    //   { roleName: 'cms-publisher', action: 'write', scopeNames: 'authenticated' },
    //   { roleName: 'cms-publisher', action: 'publish', scopeNames: 'authenticated' },
    //   { roleName: 'root', action: 'read', scopeNames: 'authenticated' },
    // ];
    async addRoleRightBatch({ module, atomClassName, atomClassIdParent = 0, roleRights }) {
      // module
      module = module || this.moduleName;
      const _module = ctx.app.meta.modules[module];
      // atomClass
      const atomClass = await ctx.meta.atomClass.get({ module, atomClassName, atomClassIdParent });
      // roleRights
      if (!roleRights || !roleRights.length) return;
      for (const roleRight of roleRights) {
        // role
        const role = await this.get({ roleName: roleRight.roleName });
        // scope
        let scope;
        if (!roleRight.scopeNames) {
          scope = 0;
        } else {
          scope = [];
          const scopeNames = Array.isArray(roleRight.scopeNames) ? roleRight.scopeNames : roleRight.scopeNames.split(',');
          for (const scopeName of scopeNames) {
            const roleScope = await this.get({ roleName: scopeName });
            scope.push(roleScope.id);
          }
        }
        // add role right
        await this.addRoleRight({
          roleId: role.id,
          atomClassId: atomClass.id,
          action: ctx.constant.module('a-base').atom.action[roleRight.action] || _module.main.meta.base.atoms[atomClassName]
            .actions[roleRight.action].code,
          scope,
        });
      }
    }

    // const roleFunctions = [
    //   { roleName: 'root', name: 'listComment' },
    // ];
    async addRoleFunctionBatch({ module, roleFunctions }) {
      if (!roleFunctions || !roleFunctions.length) return;
      module = module || this.moduleName;
      for (const roleFunction of roleFunctions) {
        // func
        const func = await ctx.meta.function.get({ module, name: roleFunction.name });
        if (roleFunction.roleName) {
          // role
          const role = await this.get({ roleName: roleFunction.roleName });
          // add role function
          await this.addRoleFunction({
            roleId: role.id,
            functionId: func.id,
          });
        }
      }
    }

    async _buildRolesRemove({ iid }) {
      await ctx.model.query(`delete from aRoleRef where aRoleRef.iid=${iid}`);
      await ctx.model.query(`delete from aRoleIncRef where aRoleIncRef.iid=${iid}`);
      await ctx.model.query(`delete from aRoleExpand where aRoleExpand.iid=${iid}`);
    }

    async _buildRolesAdd({ iid, roleIdParent }, progress) {
      const list = await ctx.model.query(
        `select a.id,a.roleName,a.catalog from aRole a where a.iid=${iid} and a.roleIdParent=${roleIdParent}`
      );
      for (const item of list) {
        // info
        const roleId = item.id;
        const catalog = item.catalog;
        // build
        await this._buildRoleRef({ iid, roleId });
        await this._buildRoleIncRef({ iid, roleId });
        await this._buildRoleExpand({ iid, roleId });
        // catalog
        if (catalog === 1) {
          await this._buildRolesAdd({ iid, roleIdParent: roleId }, progress);
        }
        // progress
        if (progress.progressId) {
          await ctx.meta.progress.update({
            progressId: progress.progressId, progressNo: 0,
            total: progress.total, progress: progress.progress++,
            text: item.roleName,
          });
        }
      }
    }

    async _buildRoleRef({ iid, roleId }) {
      let level = 0;
      let roleIdParent = roleId;
      // loop
      while (level !== -1) {
        await ctx.model.query(
          `insert into aRoleRef(iid,roleId,roleIdParent,level)
             values(${iid},${roleId},${roleIdParent},${level})
          `
        );
        const item = await ctx.model.queryOne(
          `select a.roleIdParent from aRole a where a.iid=${iid} and a.id=${roleIdParent}`
        );
        if (!item || !item.roleIdParent) {
          level = -1;
        } else {
          roleIdParent = item.roleIdParent;
          level++;
        }
      }
    }

    async _buildRoleIncRef({ iid, roleId }) {
      await ctx.model.query(
        `insert into aRoleIncRef(iid,roleId,roleIdInc,roleIdSrc)
            select ${iid},${roleId},a.roleIdInc,a.roleId from aRoleInc a
              where a.iid=${iid} and a.roleId in (select b.roleIdParent from aRoleRef b where b.iid=${iid} and b.roleId=${roleId})
        `);
    }

    async _buildRoleExpand({ iid, roleId }) {
      await ctx.model.query(
        `insert into aRoleExpand(iid,roleId,roleIdBase)
            select a.iid,a.roleId,a.roleIdParent from aRoleRef a
              where a.iid=${iid} and a.roleId=${roleId}
        `);
      await ctx.model.query(
        `insert into aRoleExpand(iid,roleId,roleIdBase)
            select a.iid,a.roleId,a.roleIdInc from aRoleIncRef a
              where a.iid=${iid} and a.roleId=${roleId}
        `);
    }

  }

  return Role;
};
