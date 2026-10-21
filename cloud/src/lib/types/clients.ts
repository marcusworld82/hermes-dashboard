// Shared UI contracts, copied without local server implementation.

export type ClientInput={name:string;business:string;contact:string;email:string;phone:string;services:string;price:number|null;startDate:string;stage:string;notes:string;nextAction:string;retainerDetails:string;links:string;sourceLead:string;evidence:string};
export type Client=ClientInput&{id:string;notionUrl:string;key:string;lastEdited:string};
export type Deliverable={id:string;notionUrl:string;name:string;clientId:string;dueDate:string;status:string;notes:string;links:string;cardId:string;key:string;lastEdited:string};
export type ClientsCache={clients:Client[];deliverables:Deliverable[];checkedAt:string|null;attemptedAt:string|null;error:string|null};
