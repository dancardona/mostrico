# Mostrico Design System

El mercado es la referencia visual de Mostrico: superficies carbón, acento lima,
turquesa para venta y ámbar para Bitcoin. Las pantallas operativas comparten
tipografía, espaciado, controles y estados; no tienen composiciones de landing.

## Fuente de verdad

- `app/globals.css`: tokens semánticos y patrones `ds-*` compartidos.
- `tailwind.config.ts`: colores Tailwind enlazados a los tokens RGB, con soporte de opacidad.
- `components/ui.tsx`: componentes de contenido y controles.
- `components/app-nav.tsx`: navegación accesible con ruta activa.
- `app/market/market.module.css`: únicamente presentación específica del listado.

Los colores base se cambian en `:root`, no con valores hex nuevos por pantalla.
`paper`, `panel`, `raised`, `line`, `ink`, `muted`, `accent`, `sell`, `bitcoin` y
`danger` son roles semánticos. El acento no implica confirmación de un pago.

## Composición

```tsx
<PageHeader
  eyebrow="Mostro / Nueva oferta"
  title="Crear orden"
  description="Monto, precio y condiciones de tu oferta."
  actions={<Button className="ds-button-secondary">Actualizar</Button>}
/>
<div className="ds-workspace">
  <Section>{/* Formulario principal */}</Section>
  <aside className="ds-rail">
    <Section><dl className="ds-data-list"><DataField label="Monto" value="100.000 COP" /></dl></Section>
  </aside>
</div>
```

- `Section`: secciones abiertas, delimitadas por líneas, sin fondo ni sombra.
- `Card`: solo elementos repetidos, como resultados de diagnóstico. No anidar tarjetas.
- `PageHeader`: un H1, contexto opcional, ID legible y acciones independientes.
- `DataField`: etiquetas y valores con ajuste de línea para datos extensos.
- `Button`, `TextInput`, `AmountInput`, `TextArea`: altura mínima de 44 px, radio de 6 px y foco visible.
- `Notice` / `ErrorNotice`: estados con texto explícito; no depender solo del color.
- `ds-segmented`: selección de modo; mantener `aria-pressed` en cada opción.
- `ds-confirmation`: confirmaciones sensibles, nunca preseleccionadas.

## Legibilidad y comportamiento

Usar `lib/format.ts` para montos, porcentajes y contadores (`es-CO`). Los IDs y
facturas no se formatean. No inventar precios, reputación o estados de Mostro.

H1 de 32 px en escritorio y 27 px en móvil, sin escalado por ancho de viewport ni
tracking negativo. Conservar el tamaño original del QR y su fondo blanco.
El chat flotante conserva sus dimensiones y notificaciones, y solo los diálogos
y herramientas superpuestas usan elevación.

Probar a 1440, 390 y 320 px, sin desbordamiento horizontal. Los filtros secundarios
del mercado se despliegan en móvil; las confirmaciones de dinero siguen visibles.

## Verificación

`npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`.
Las pruebas de navegador usan el CLI simulado o rutas interceptadas; nunca deben
confirmar acciones financieras contra el nodo real.
