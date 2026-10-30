import { buildTransportNetwork as buildBaseNetwork } from './transport-base.js?v=20261028-museum4-osm-live-v2';
import { SATURN_ACCESS, buildSaturnNorthwestAccess } from './saturn-access.js?v=20261030-landscape-roads-v1';
import { connectedRoadData } from './road-layout.js?v=20261028-museum4-osm-live-v2';
import { buildSouthInterchange } from './south-interchange.js?v=20261028-museum4-osm-live-v2';
import { buildGagarinRailApproach } from './gagarin-rail-approach.js?v=20261028-museum4-osm-live-v2';
import {buildFacilityRailApproaches} from './facility-rails.js?v=20261028-museum4-osm-live-v2';
import {buildTrainRoutePlan} from './traffic-paths.js?v=20261028-museum4-osm-live-v2';

export function buildTransportNetwork(options) {
  const data=connectedRoadData(options.data,options.point,options.siteRecords);
  const interchange=buildSouthInterchange({...options,data,deferRoadSurfaces:true});
  const gagarinRail=buildGagarinRailApproach({...options,data});
  const facilityRails=buildFacilityRailApproaches({...options,data});
  const trainPlan=buildTrainRoutePlan({...options,data,gagarinRail});
  // Replace the previous southwest route, never draw a second road over it.
  // The northwest route is resolved from the current site transform and the
  // actual arterial spline; the old approximate JSON coordinates are unused.
  const remaining=data.routes.road.filter(r=>r.id!==SATURN_ACCESS.routeId);
  const filtered={...data,routes:{...data.routes,road:remaining},
    facilityDriveways:(data.facilityDriveways||[]).filter(n=>String(n)!=='23')};
  filtered.junctions=filtered.junctions.filter(p=>!interchange.isCrossing(p));
  const access=buildSaturnNorthwestAccess({...options,data,deferRoadSurfaces:true});
  const network=buildBaseNetwork({...options,data:filtered,
    roadElevation:interchange.roadElevation,railElevation:interchange.railElevation,gagarinRail,facilityRails,extraRails:[...trainPlan.extraRails,...facilityRails.extras],extraRoads:[...interchange.roadSurfaces,access.roadSurface]});
  return {...network,
    trainPath:()=>trainPlan,
    roadPaths:()=>[...network.roadPaths(),access.lampPath,...interchange.ramps],
    routes:{...data.routes,road:[...remaining,access.route]},
    stats(){
      const stats=network.stats();
      return {...stats,roadRoutes:stats.roadRoutes+1,
        siteAccess:[...new Set([...(stats.siteAccess||[]),'23'])],
        saturnAccess:access.report,interchange:interchange.stats(),facilityRailPorts:facilityRails.reports,gagarinRail:gagarinRail.stats()};
    }
  };
}
