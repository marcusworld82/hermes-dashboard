export type ApprovalQuote={usd:number;expiresAt:number;reservedUsd:number;monthlyUsd:number;requiresBudgetConfirmation?:boolean};
export function generationApproval(input:{quote:ApprovalQuote|null;quantity:number;confirmPrice:boolean;confirmBudget:boolean;sourceRequired:boolean;sourceReady:boolean;sourceApproved:boolean;now?:number}){
 const {quote}=input,now=input.now??Date.now();
 const known=!!quote&&[quote.usd,quote.expiresAt,quote.reservedUsd,quote.monthlyUsd].every(Number.isFinite)&&quote.usd>=0&&quote.monthlyUsd>0&&[1,2,4].includes(input.quantity);
 const total=known?quote!.usd*input.quantity:null,needsPriceApproval=total!==null&&total>1,needsBudgetApproval=known&&(!!quote!.requiresBudgetConfirmation||quote!.reservedUsd+total!>=quote!.monthlyUsd);
 const ready=known&&quote!.expiresAt>now&&(!needsPriceApproval||input.confirmPrice)&&(!needsBudgetApproval||input.confirmBudget)&&(!input.sourceRequired||input.sourceReady&&input.sourceApproved);
 return {total,needsPriceApproval,needsBudgetApproval,ready};
}
