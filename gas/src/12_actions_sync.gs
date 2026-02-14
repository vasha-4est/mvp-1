/** Sync actions for WebApp polling */

(function initSyncActions_(){

  Actions_.register_('sync.pull', (ctx)=>{
    // payload: { since_ts, limit }
    const sinceTs = String(ctx.payload.since_ts || '').trim();
    const limit = Number(ctx.payload.limit || 200);

    let events = Db_.readAll_(SHEET.EVENTS);
    if (sinceTs) {
      const since = new Date(sinceTs).getTime();
      events = events.filter(e => {
        const t = new Date(e.server_ts).getTime();
        return t > since;
      });
    }
    events = events.sort((a,b)=> new Date(a.server_ts) - new Date(b.server_ts)).slice(0, limit);

    // also return "server cursor" = max server_ts
    const cursor = events.length ? events[events.length-1].server_ts : (sinceTs || nowIso_());

    return { events, cursor };
  });

})();
