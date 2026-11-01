// Envelope of the six supplied tyres, including their actual polygon profile.
import {A320_PROFILE} from '../src/a320-profile.js';
export const a320TyreProbes=[...[-4.43,-3.23,3.23,4.43].flatMap(x=>A320_PROFILE.mainSupport.map(([y,z])=>[x,y,z])),...[-.37,.37].flatMap(x=>A320_PROFILE.noseSupport.map(([y,z])=>[x,y,z]))];
