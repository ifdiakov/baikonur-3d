import {validateWorkshopState as validateBase,applyWorkshopObjects,WORKSHOP_STORAGE,WORKSHOP_VERSION} from './workshop-state.js';
import {validateRailEdits} from './workshop-network-core.js';
export {applyWorkshopObjects,WORKSHOP_STORAGE,WORKSHOP_VERSION};
export function validateWorkshopState(input){return {...validateBase(input),railEdits:validateRailEdits(input?.railEdits)};}
