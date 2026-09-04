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

El chat usa por defecto el endpoint push oficial de Mostro Mobile. Puede cambiarse con `MOSTRO_PUSH_SERVER_URL`; la ruta de la base local también puede ajustarse con `MOSTRO_CLI_DB_PATH`.

## Seguridad

- La app es local-only y debe correr en `127.0.0.1`.
- Nunca pide mnemonic, `nsec`, `ADMIN_NSEC` ni claves privadas.
- Para el chat, abre `~/.mcli/mcli.db` en modo de solo lectura y obtiene únicamente la clave de intercambio de la orden solicitada. Esa clave se usa solo en el servidor y nunca se devuelve al navegador ni se escribe en logs.
- No expongas el servidor local a LAN o internet.
- Respalda tu identidad de Mostro CLI siguiendo la documentación oficial.
- Verifica las instrucciones de pago fuera de la app antes de transferir fiat.
- `fiatsent` solo declara ante Mostro que ya pagaste; no ejecuta una transferencia bancaria.
- El chat viaja cifrado con el protocolo actual de Mostro (ECDH, claves `K_conv`/`K_sign`, NIP-44 y eventos kind 14). Mostrico guarda localmente, en texto plano y con permisos `0600`, hasta 200 mensajes por operación para reconstruir la conversación.

## Comandos útiles

```bash
mostro-cli --version
mostro-cli --help
mostro-cli listorders -k sell -c cop
npm test
npm run test:e2e
```

## Alcance MVP

Mostrico lista ofertas `sell`, muestra detalle, permite tomar una oferta, resolver la garantía anti-abuso cuando el nodo la exige, agregar invoice, consultar DMs, chatear directamente con la contraparte, marcar fiat enviado con confirmación explícita, calificar y abrir disputa. La garantía se presenta como una hold invoice para copiar o abrir en la wallet; Mostrico nunca la paga automáticamente.

El chat usa el transporte kind 14 vigente en Mostro Mobile y conserva `getdmuser` como lectura compatible para conversaciones antiguas. Después de publicar, solicita al servidor push que despierte el dispositivo de la contraparte; esa notificación es opcional y la entrega sigue dependiendo de los relays. Mostrico detecta la pubkey de intercambio cuando el CLI la entrega asociada a la orden; si esa versión del CLI no la expone, puede configurarse manualmente. El destinatario se resuelve siempre en el servidor y los mensajes recibidos se renderizan como texto plano.

También permite publicar órdenes maker de compra o venta desde `/orders/new`. El formulario admite monto fijo o rango, precio de mercado o sats fijos, métodos de pago, premium y expiración. En una venta, si Mostro devuelve una hold invoice, Mostrico la muestra para copiarla pero no la paga ni la persiste.

La app no implementa wallet Lightning, transferencias bancarias, administración, solver commands ni ejecución arbitraria del CLI.
