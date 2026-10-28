import { buildTransportNetwork as buildBaseNetwork } from './transport-base.js?v=20261028-traffic-v1';
import { SATURN_ACCESS, buildSaturnNorthwestAccess } from './saturn-access.js?v=20261028-road-editor';
import { connectedRoadData } from './road-layout.js';
import { buildSouthInterchange } from './south-interchange.js';
import { buildGagarinRailApproach } from './gagarin-rail-approach.js';
import {buildTrainRoutePlan} from './traffic-paths.js';

export function buildTransportNetwork(options) {
  const data=connectedRoadData(options.data,options.point,options.siteRecords);
  const interchange=buildSouthInterchange({...options,data});
  const gagarinRail=buildGagarinRailApproach({...options,data});
  const trainPlan=buildTrainRoutePlan({...options,data,gagarinRail});
  // Replace the previous southwest route, never draw a second road over it.
  // The northwest route is resolved from the current site transform and the
  // actual arterial spline; the old approximate JSON coordinates are unused.
  const remaining=data.routes.road.filter(r=>r.id!==SATURN_ACCESS.routeId);
  const filtered={...data,routes:{...data.routes,road:remaining},
    facilityDriveways:(data.facilityDriveways||[]).filter(n=>String(n)!=='23')};
  filtered.junctions=filtered.junctions.filter(p=>!interchange.isCrossing(p));
  const network=buildBaseNetwork({...options,data:filtered,
    roadElevation:interchange.roadElevation,railElevation:interchange.railElevation,gagarinRail,extraRails:trainPlan.extraRails});
  const access=buildSaturnNorthwestAccess({...options,data});
  return {...network,
    trainPath:()=>trainPlan,
    roadPaths:()=>[...network.roadPaths(),access.lampPath,...interchange.ramps],
    routes:{...data.routes,road:[...remaining,access.route]},
    stats(){
      const stats=network.stats();
      return {...stats,roadRoutes:stats.roadRoutes+1,
        siteAccess:[...new Set([...(stats.siteAccess||[]),'23'])],
        saturnAccess:access.report,interchange:interchange.stats(),gagarinRail:gagarinRail.stats()};
    }
  };
}
