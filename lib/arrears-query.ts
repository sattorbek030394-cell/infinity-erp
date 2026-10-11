import { tolanganSql } from "./qarz-sql";
// Read-only reporting allocation: payments cover the earliest installments first.
// Bekor qilingan kelgusi ustama ham qoplangan deb hisoblanadi (PAY-08).
export const arrearsQuery = `WITH scoped AS (
 SELECT c.*,i.model,i.imei,
 ${tolanganSql()}+COALESCE((SELECT sum(x.markup_cancelled) FROM contract_closures x WHERE x.contract_id=c.id AND x.status='completed'),0) paid
 FROM contracts c JOIN inventory i ON i.id=c.inventory_id AND i.tenant_id=c.tenant_id AND i.branch_id=c.branch_id
 WHERE c.tenant_id=$1 AND c.branch_id=$2
), scheduled AS (
 SELECT s.*,sum(s.amount) OVER(PARTITION BY s.contract_id ORDER BY s.sequence) cumulative
 FROM installments s JOIN scoped c ON c.id=s.contract_id
), report AS (
 SELECT c.id,c.customer_label,c.number,c.model,c.imei,c.total-c.down_payment-c.paid balance,
 COALESCE((SELECT m.phone1 FROM customers m WHERE m.id=c.customer_id AND m.tenant_id=c.tenant_id),'') phone,
 (SELECT LEAST(s.amount,s.cumulative-c.paid) FROM scheduled s WHERE s.contract_id=c.id AND s.amount>0 AND s.cumulative>c.paid ORDER BY s.sequence LIMIT 1) next_amount,
 GREATEST(COALESCE((SELECT sum(s.amount) FROM scheduled s WHERE s.contract_id=c.id AND s.due_date<$3::date),0)-c.paid,0) overdue,
 (SELECT min(s.due_date) FROM scheduled s WHERE s.contract_id=c.id AND s.amount>0 AND s.cumulative>c.paid) first_unpaid
 FROM scoped c
)
SELECT id,customer_label,number,phone,model,imei,balance,overdue,next_amount,first_unpaid::text first_unpaid,CASE WHEN overdue>0 THEN $3::date-first_unpaid ELSE 0 END days_late
FROM report WHERE balance>0 ORDER BY overdue DESC,first_unpaid,id`;
