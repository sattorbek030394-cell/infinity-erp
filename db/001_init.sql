CREATE TABLE tenants(id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE branches(id uuid PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants, name text NOT NULL, UNIQUE(tenant_id,id));
CREATE TABLE users(id uuid PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL);
CREATE TABLE memberships(user_id uuid REFERENCES users, tenant_id uuid NOT NULL, branch_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('admin','cashier','viewer')), PRIMARY KEY(user_id,branch_id), FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id));
CREATE TABLE sessions(token_hash text PRIMARY KEY, user_id uuid REFERENCES users, expires_at timestamptz NOT NULL);
CREATE TABLE login_attempts(email text PRIMARY KEY, attempts int NOT NULL DEFAULT 0, blocked_until timestamptz);
CREATE TABLE inventory(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL, imei text NOT NULL CHECK(imei ~ '^[0-9]{15}$'), model text NOT NULL, cost bigint NOT NULL CHECK(cost >= 0), status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','sold')), UNIQUE(tenant_id,imei), UNIQUE(tenant_id,branch_id,id), FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id));
CREATE TABLE contracts(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL, inventory_id uuid NOT NULL UNIQUE, customer_label text NOT NULL, total bigint NOT NULL CHECK(total>0), down_payment bigint NOT NULL CHECK(down_payment>=0 AND down_payment<total), months int NOT NULL CHECK(months BETWEEN 1 AND 36), start_date date NOT NULL, UNIQUE(tenant_id,branch_id,id), FOREIGN KEY(tenant_id,branch_id,inventory_id) REFERENCES inventory(tenant_id,branch_id,id));
CREATE TABLE installments(contract_id uuid REFERENCES contracts, sequence int NOT NULL, due_date date NOT NULL, amount bigint NOT NULL CHECK(amount>0), PRIMARY KEY(contract_id,sequence));
CREATE TABLE payments(id uuid PRIMARY KEY, tenant_id uuid NOT NULL, branch_id uuid NOT NULL, contract_id uuid NOT NULL, amount bigint NOT NULL CHECK(amount>0), method text NOT NULL CHECK(method IN ('cash','card','transfer')), request_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,branch_id,request_key), FOREIGN KEY(tenant_id,branch_id,contract_id) REFERENCES contracts(tenant_id,branch_id,id));
CREATE TABLE audit_events(id bigserial PRIMARY KEY, user_id uuid REFERENCES users, tenant_id uuid NOT NULL, branch_id uuid NOT NULL, action text NOT NULL, record_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX payments_contract ON payments(contract_id);
CREATE INDEX inventory_scope ON inventory(tenant_id,branch_id);

