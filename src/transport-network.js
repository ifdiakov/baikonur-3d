import { buildTransportNetwork as buildBaseNetwork } from './transport-base.js?v=20261031-facilities-rails-lighting-v2';
import { SATURN_ACCESS } from './saturn-access.js?v=20261030-river-roads-signs-v1';
import { connectedRoadData } from './road-layout.js?v=20261031-facilities-rails-lighting-v1';
import { buildSouthInterchange } from './south-interchange.js?v=20261031-facilities-rails-lighting-v2';
import { buildGagarinRailApproach } from './gagarin-rail-approach.js?v=20261031-facilities-rails-lighting-v1';
import {buildFacilityRailApproaches} from './facility-rails.js?v=20261031-facilities-rails-lighting-v1';
import {buildTrainRoutePlan} from './traffic-paths.js?v=20261031-facilities-rails-lighting-v1';

export function buildTransportNetwork(options) {
  // Remove the retired Saturn road before snapping endpoints or building
  // junctions, so the legacy layout cannot leave pavement, paint gaps or lamps.
  const source={...options.data,routes:{...options.data.routes,
    road:options.data.routes.road.filter(r=>r.id!==SATURN_ACCESS.routeId)},
    facilityDriveways:(options.data.facilityDriveways||[]).filter(n=>String(n)!=='23')};
  const data=connectedRoadData(source,options.point,options.siteRecords);
  const interchange=buildSouthInterchange({...options,data,deferRoadSurfaces:true});
  const gagarinRail=buildGagarinRailApproach({...options,data});
  const facilityRails=buildFacilityRailApproaches({...options,data});
  const trainPlan=buildTrainRoutePlan({...options,data,gagarinRail});
  data.junctions=data.junctions.filter(p=>!interchange.isCrossing(p));
  const network=buildBaseNetwork({...options,data,
    roadElevation:interchange.roadElevation,railElevation:interchange.railElevation,gagarinRail,facilityRails,extraRails:[...trainPlan.extraRails,...facilityRails.extras],extraRoads:interchange.roadSurfaces});
  return {...network,
    trainPath:()=>trainPlan,
    roadPaths:()=>[...network.roadPaths(),...interchange.ramps],
    routes:data.routes,
    stats(){
      const stats=network.stats();
      return {...stats,saturnAccess:null,
        interchange:interchange.stats(),facilityRailPorts:facilityRails.reports,gagarinRail:gagarinRail.stats()};
    }
  };
}
