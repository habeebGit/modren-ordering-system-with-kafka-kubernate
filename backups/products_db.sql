--
-- PostgreSQL database dump
--

\restrict 3bZQfBas1LOV7TrBsfpsSw7vX8BAWZEEWh0VHW28V1zkaz8JfXPFrM9FR14q0sD

-- Dumped from database version 14.21 (Debian 14.21-1.pgdg13+1)
-- Dumped by pg_dump version 14.21 (Debian 14.21-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id integer NOT NULL,
    order_id integer,
    product_id integer NOT NULL,
    quantity integer NOT NULL,
    price numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.order_items_id_seq OWNER TO postgres;

--
-- Name: order_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.order_items_id_seq OWNED BY public.order_items.id;


--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id integer NOT NULL,
    user_id integer NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying,
    total_amount numeric(10,2) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.orders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.orders_id_seq OWNER TO postgres;

--
-- Name: orders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.orders_id_seq OWNED BY public.orders.id;


--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    price numeric(10,2) NOT NULL,
    stock integer DEFAULT 0,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    reserved_stock integer DEFAULT 0 NOT NULL
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.products_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.products_id_seq OWNER TO postgres;

--
-- Name: products_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.products_id_seq OWNED BY public.products.id;


--
-- Name: order_items id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items ALTER COLUMN id SET DEFAULT nextval('public.order_items_id_seq'::regclass);


--
-- Name: orders id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders ALTER COLUMN id SET DEFAULT nextval('public.orders_id_seq'::regclass);


--
-- Name: products id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products ALTER COLUMN id SET DEFAULT nextval('public.products_id_seq'::regclass);


--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.order_items (id, order_id, product_id, quantity, price, created_at) FROM stdin;
1	1	1	1	2499.99	2026-02-26 14:29:39.70477
2	1	3	3	249.99	2026-02-26 14:29:39.70477
3	2	4	1	599.99	2026-02-26 14:29:39.70477
4	2	6	1	179.99	2026-02-26 14:29:39.70477
5	3	2	1	999.99	2026-02-26 14:29:39.70477
6	3	5	2	399.99	2026-02-26 14:29:39.70477
\.


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.orders (id, user_id, status, total_amount, created_at, updated_at) FROM stdin;
1	1	completed	3248.98	2026-02-26 14:29:39.703495	2026-02-26 14:29:39.703495
2	1	pending	649.98	2026-02-26 14:29:39.703495	2026-02-26 14:29:39.703495
3	2	completed	1799.98	2026-02-26 14:29:39.703495	2026-02-26 14:29:39.703495
\.


--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.products (id, name, price, stock, description, created_at, updated_at, reserved_stock) FROM stdin;
1	MacBook Pro 16"	2499.99	15	Apple MacBook Pro with M2 Max chip	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
2	iPhone 15 Pro	999.99	25	Latest iPhone with titanium design	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
3	AirPods Pro	249.99	50	Active noise cancellation wireless earbuds	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
4	iPad Air	599.99	30	10.9-inch iPad with M1 chip	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
5	Apple Watch Series 9	399.99	40	Advanced health and fitness tracking	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
6	Magic Keyboard	179.99	20	Wireless keyboard for Mac and iPad	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
7	Studio Display	1599.99	8	27-inch 5K Retina display	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
8	Mac Mini	699.99	12	Compact desktop computer with M2 chip	2026-02-26 14:29:39.67492	2026-02-26 14:29:39.67492	0
9	UI Test Product	12.50	5	\N	2026-02-26 14:45:04.853	2026-02-26 14:45:04.853	0
10	sdef	12.00	111	\N	2026-02-26 14:49:04.476	2026-02-26 14:49:04.476	0
\.


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.order_items_id_seq', 6, true);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.orders_id_seq', 3, true);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.products_id_seq', 10, true);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 3bZQfBas1LOV7TrBsfpsSw7vX8BAWZEEWh0VHW28V1zkaz8JfXPFrM9FR14q0sD

