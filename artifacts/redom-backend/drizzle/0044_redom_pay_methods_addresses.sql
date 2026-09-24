CREATE TABLE IF NOT EXISTS redom_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(30) NOT NULL DEFAULT 'paystack',
  authorization_code_encrypted text NOT NULL,
  authorization_signature varchar(255),
  customer_email varchar(255) NOT NULL,
  brand varchar(80),
  card_type varchar(120),
  last4 varchar(4),
  exp_month integer,
  exp_year integer,
  bank varchar(120),
  country_code varchar(2),
  currency varchar(3),
  reusable boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS redom_payment_methods_user_signature_idx
  ON redom_payment_methods(user_id, authorization_signature)
  WHERE authorization_signature IS NOT NULL;

CREATE INDEX IF NOT EXISTS redom_payment_methods_user_idx
  ON redom_payment_methods(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS redom_payment_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country_code varchar(2) NOT NULL,
  country_name varchar(120) NOT NULL,
  full_name varchar(180) NOT NULL,
  address_line1 varchar(255) NOT NULL,
  address_line2 varchar(255),
  city varchar(120) NOT NULL,
  state varchar(120),
  postal_code varchar(40),
  mapbox_place_id varchar(255),
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS redom_payment_addresses_user_idx
  ON redom_payment_addresses(user_id, updated_at DESC);
