/**
 * Actions dispatcher.
 *
 * Each action module calls Actions_.register_('action.name', fn)
 */

const Actions_ = (() => {
  const map = {};

  function register_(action, fn) {
    if (!action) throw new Error('register_: action empty');
    map[action] = fn;
  }

  function dispatch_(action, ctx) {
    const fn = map[action];
    if (!fn) throw new Error(ERROR.NOT_FOUND + ': unknown action ' + action);
    return fn(ctx);
  }

  // minimal always-on
  register_('ping', (ctx) => ({ pong: true, server_ts: nowIso_(), actor: ctx.actor }));

  return { register_, dispatch_ };
})();
