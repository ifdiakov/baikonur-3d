import { buildTransportNetwork as buildBaseNetwork } from './transport-base.js';
import { SATURN_ACCESS, buildSaturnNorthwestAccess } from './saturn-access.js?v=20261028-hill20';

export function buildTransportNetwork(options) {
  const {data}=options;
  // Replace the previous southwest route, never draw a second road over it.
  // The northwest route is resolved from the current site transform and the
  // actual arterial spline; the old approximate JSON coordinates are unused.
  const remaining=data.routes.road.filter(r=>r.id!==SATURN_ACCESS.routeId);
  const filtered={...data,routes:{...data.routes,road:remaining},
    facilityDriveways:(data.facilityDriveways||[]).filter(n=>String(n)!=='23')};
  const network=buildBaseNetwork({...options,data:filtered});
  const access=buildSaturnNorthwestAccess(options);
  return {...network,
    routes:{...data.routes,road:[...remaining,access.route]},
    stats(){
      const stats=network.stats();
      return {...stats,roadRoutes:stats.roadRoutes+1,
        siteAccess:[...new Set([...(stats.siteAccess||[]),'23'])],
        saturnAccess:access.report};
    }
  };
}
