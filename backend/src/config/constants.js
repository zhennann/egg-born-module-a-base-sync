module.exports = {
  systemRoles: [ 'root', 'anonymous', 'authenticated', 'registered', 'activated', 'superuser', 'organization', 'internal', 'external' ],
  atom: {
    action: {
      create: 1,
      read: 2,
      write: 3,
      delete: 4,
      save: 51,
      submit: 52,
      custom: 100, // custom action start from custom
    },
    actionMeta: {
      create: { title: 'Create', actionComponent: 'action' },
      read: { title: 'View', actionPath: 'atom/view?atomId={{atomId}}&itemId={{itemId}}&atomClassId={{atomClassId}}&module={{module}}&atomClassName={{atomClassName}}&atomClassIdParent={{atomClassIdParent}}' },
      write: { title: 'Edit', actionPath: 'atom/edit?atomId={{atomId}}&itemId={{itemId}}&atomClassId={{atomClassId}}&module={{module}}&atomClassName={{atomClassName}}&atomClassIdParent={{atomClassIdParent}}' },
      delete: { title: 'Delete', actionComponent: 'action' },
      save: { title: 'Save', actionComponent: 'action', authorize: false },
      submit: { title: 'Submit', actionComponent: 'action', authorize: false },
      custom: { title: 'Custom' },
    },
  },
  function: {
    scene: {
      default: 0,
      create: 1,
      list: 2,
      report: 20,
      tools: 50,
      custom: 100,
    },
  },
};
