# Mostrico

Interfaz web local, en español, para operar Bitcoin P2P usando una instalación existente de `mostro-cli`.

## Requisitos

- Node.js LTS
- `mostro-cli` instalado y configurado
- Una wallet Lightning capaz de generar invoices BOLT11
- Pubkey público de la instancia Mostro y relays `wss://`

## Instalación

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre:

```text
http://127.0.0.1:3000
```

## Configuración

Edita `.env.local`:

```env
MOSTRO_PUBKEY=<npub o hex público de la instancia Mostro>
RELAYS=wss://relay.example,wss://another.example
```

Si `mostro-cli` no está en `PATH`, define:

```env
MOSTRO_CLI_PATH=/ruta/a/mostro-cli
```

## Seguridad

- La app es local-only y debe correr en `127.0.0.1`.
- Nunca pide mnemonic, `nsec`, `ADMIN_NSEC` ni claves privadas.
- No abre ni parsea `~/.mcli/mcli.db`.
- No expongas el servidor local a LAN o internet.
- Respalda tu identidad de Mostro CLI siguiendo la documentación oficial.
- Verifica las instrucciones de pago fuera de la app antes de transferir fiat.
- `fiatsent` solo declara ante Mostro que ya pagaste; no ejecuta una transferencia bancaria.

## Comandos útiles

```bash
mostro-cli --version
mostro-cli --help
mostro-cli listorders -k sell -c cop
npm test
npm run test:e2e
```

## Alcance MVP

Mostrico lista ofertas `sell`, muestra detalle, permite tomar una oferta, agregar invoice, consultar DMs, marcar fiat enviado con confirmación explícita, calificar y abrir disputa.

También permite publicar órdenes maker de compra o venta desde `/orders/new`. El formulario admite monto fijo o rango, precio de mercado o sats fijos, métodos de pago, premium y expiración. En una venta, si Mostro devuelve una hold invoice, Mostrico la muestra para copiarla pero no la paga ni la persiste.

La app no implementa wallet Lightning, transferencias bancarias, administración, solver commands ni ejecución arbitraria del CLI.
