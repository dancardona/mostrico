# Contribuir a Mostrico

Gracias por ayudar a mejorar Mostrico. El proyecto toca Bitcoin, Nostr, Lightning y una base local de `mostro-cli`, así que la prioridad es avanzar sin debilitar los límites de seguridad.

## Primeros pasos

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abre `http://127.0.0.1:3000` y configura solo valores públicos de Mostro. No agregues mnemonic, `nsec`, `ADMIN_NSEC` ni claves privadas a archivos, logs, fixtures o capturas.

## Flujo de desarrollo

1. Crea una rama corta desde `master`.
2. Mantén los cambios enfocados en una mejora o corrección.
3. Agrega o actualiza pruebas cuando cambies parsers, comandos, rutas API o flujos de compra/venta.
4. Usa fixtures sanitizados para salidas de `mostro-cli`.
5. Abre un pull request con contexto, capturas si cambia UI y notas de seguridad si cambia manejo de datos.

## Comandos de verificación

```bash
npm run lint
npm test
npm run build
npm run test:e2e
```

Los tests E2E levantan Next.js en `127.0.0.1:3100` con `MOSTRO_WEB_MOCK_CLI=1`, por lo que no necesitan una instancia real de Mostro ni una wallet Lightning.

## Reglas de seguridad

- Mantén Mostrico como app local-only.
- No leas ni devuelvas secretos del usuario al navegador.
- No ejecutes comandos arbitrarios; usa constructores de argumentos allowlisted.
- Redacta invoices, claves, mnemonics y salidas crudas sensibles antes de mostrarlas.
- Abre `~/.mcli/mcli.db` solo en modo lectura cuando el chat necesite resolver la contraparte.
- Nunca hagas pagos Lightning ni transferencias fiat desde la app.

## Pull requests

Antes de pedir revisión, revisa que:

- La UI siga en español y sea clara para una operación P2P.
- Los errores de `mostro-cli` se presenten como mensajes seguros y accionables.
- Las acciones destructivas tengan confirmación explícita.
- README, `.env.example` o `docs/` estén actualizados si cambia configuración o comportamiento.
- GitHub Actions pasen o expliques cualquier falla reproducible.

## GitHub Actions

El repositorio incluye checks para lint, unit tests, build, E2E con Playwright y revisión de dependencias en pull requests. Si agregas nuevos scripts críticos, actualiza los workflows para que el PR falle temprano cuando algo importante se rompa.
