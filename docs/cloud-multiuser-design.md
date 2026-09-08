# Mostrico en la nube: despliegue, identidades y sesiones

**Estado:** propuesta de arquitectura; no implementada ni aprobada para producción.

**Fecha de investigación:** 7 de septiembre de 2026.

**Alcance:** alojar Mostrico para otras personas, utilizando nuestro fork de `mostro-cli` o un cliente alternativo, sin confundir acceso web, identidad Mostro y custodia de claves.

Este documento no despliega servicios, importa semillas ni opera órdenes reales. La especificación [local-first](SPEC.md) sigue vigente para la aplicación actual. Un modo cloud requeriría una decisión explícita de producto y seguridad; no basta con cambiar el host de escucha.

**Lectura rápida:** [conclusiones](#1-resumen-ejecutivo), [investigación móvil](#4-qué-hace-la-app-móvil), [alternativas](#6-alternativas-de-arquitectura), [sesiones](#7-sesiones-web-y-autorización-propuestas), [despliegue](#13-despliegue-en-vps-nube-o-servidor-propio), [escenarios](#16-matriz-de-escenarios-funcionales-y-de-fallo), [plan](#17-plan-incremental-propuesto).

## 1. Resumen ejecutivo

**Sí podemos alojar Mostrico, pero la versión actual no es multiusuario.** Sus visitantes compartirían el `HOME`, la identidad del CLI, la base SQLite y el estado de operaciones del servidor. Agregar un login delante no crea identidades independientes.

Hay dos decisiones separadas:

1. **Dónde se ejecuta el cliente Mostro:** dispositivo del usuario, proceso CLI en servidor o servicio Rust persistente.
2. **Quién puede usar las claves de firma:** solamente el dispositivo del usuario o también la infraestructura de Mostrico.

Recomendación propuesta:

- Publicar primero un mercado de **solo lectura**, desacoplado de cualquier identidad privada.
- Si aceptamos administrar claves, hacer una beta cerrada con **una instancia aislada por usuario**, sin reutilizar nuestra identidad actual. Después evolucionar hacia un backend compartido con workers aislados por identidad.
- Si el requisito es que las claves no lleguen al servidor, utilizar **un conector local** o un cliente directo a Nostr, tomando como referencia Mobile y la implementación oficial Flutter/Rust/WASM.
- Convertir el CLI en una API persistente es una evolución válida para el modelo administrado, pero **una API no resuelve por sí sola autenticación, aislamiento, recuperación ni autoridad de firma**.

El servidor que conserva una semilla Mostro puede firmar acciones en nombre del usuario, incluidas liberaciones o cambios de invoice permitidos por el protocolo. Aunque no almacene la semilla de su billetera Lightning, representa una delegación sensible. No debemos describir ese modo como equivalente al modelo de claves locales del móvil.

## 2. Evidencia y límites de la investigación

Se inspeccionó código, documentación oficial del protocolo y guías de seguridad/despliegue. Las recomendaciones de las siguientes secciones son diseño propuesto, no funcionalidades ya disponibles.

| Proyecto | Revisión inspeccionada | Observación |
| --- | --- | --- |
| Mostrico | `83c924b4db86e595327e1ac70e83406caa9c6a2a` y árbol de trabajo local | Los cambios existentes de `/market` no forman parte de este documento. |
| Nuestro fork `mostro-cli` | `86cd798ddd08c4dda25e8dbc388f0707e241557b` | Contrato JSON parcial y persistencia de restauración. |
| `MostroP2P/mobile` | `637fd430a1ca548dfe6c4639ee3afb023289f8cc` | Cliente Flutter; commit de versión 1.4.2. |
| `MostroP2P/app` | `7e18110be168f5a1ff31dadcdf45bbf1065adfc2` | Otra implementación oficial, Flutter con núcleo Rust y destino WASM. |

Fuentes reproducibles: [Mostrico](https://github.com/dancardona/mostrico/tree/83c924b4db86e595327e1ac70e83406caa9c6a2a), [fork del CLI](https://github.com/dancardona/mostro-cli/tree/86cd798ddd08c4dda25e8dbc388f0707e241557b), [Mobile](https://github.com/MostroP2P/mobile/tree/637fd430a1ca548dfe6c4639ee3afb023289f8cc), [App](https://github.com/MostroP2P/app/tree/7e18110be168f5a1ff31dadcdf45bbf1065adfc2).

No se ejecutaron las aplicaciones Flutter, pruebas de carga, un despliegue Linux ni una auditoría criptográfica. Tampoco se verificó qué revisión está instalada en el teléfono del usuario ni la configuración actual de un nodo concreto. Los requisitos de capacidad y aceptación son objetivos por validar, no resultados medidos.

## 3. Qué impide publicar la aplicación actual

| Área | Evidencia actual | Cambio necesario para cloud |
| --- | --- | --- |
| Ejecución | [runner.ts](../lib/mostro/runner.ts) hereda `HOME` y configuración global; una cola serializa todo dentro del proceso Node. | Contexto explícito por identidad, entorno aislado y exclusión entre procesos/hosts. |
| Identidad CLI | [db.rs](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/db.rs) guarda mnemonic e índice en `~/.mcli/mcli.db`. | Aprovisionamiento y almacenamiento independientes; nunca un directorio compartido entre usuarios. |
| Estado web | [local-state.ts](../lib/store/local-state.ts) usa un JSON global indexado por `orderId`. | Repositorio por propietario, identidad y nodo; transacciones y recuperación de corrupción. |
| Cachés | [order-cache.ts](../lib/mostro/order-cache.ts), [bond-cache.ts](../lib/mostro/bond-cache.ts), [payment-invoice-cache.ts](../lib/mostro/payment-invoice-cache.ts) usan claves por orden. | Separar datos públicos y privados; no compartir invoices ni pertenencia de órdenes. |
| Autorización | Los Route Handlers crean `MostroService` sin un contexto autenticado de usuario. Ejemplos: [restore](../app/api/trades/restore/route.ts), [chat](../app/api/trades/[id]/chat/route.ts). | Autenticación y autorización en cada operación, incluidas lecturas privadas y streams. |
| Chat | [chat-transport.ts](../lib/mostro/chat-transport.ts) lee la clave privada de la operación desde SQLite y descifra en Node. | Mover esa responsabilidad al worker aislado o al dispositivo; declarar qué extremo puede leer mensajes. |
| Procesos | En un timeout el runner manda `SIGTERM` y rechaza la promesa sin esperar la salida del hijo. | No conceder otro turno de escritura hasta confirmar terminación; conservar resultado incierto. |
| Persistencia | Un error de lectura o JSON inválido se interpreta como estado vacío. | Fallar de forma visible y conservar el archivo; no convertir corrupción en una cuenta nueva. |

El fork crea una identidad cuando no existe su DB y restringe permisos del archivo. Eso es útil localmente, pero en cloud **un volumen ausente no debe generar silenciosamente otra identidad**. El worker debe comprobar un manifiesto con la identidad esperada antes de aceptar comandos. [Creación de DB](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/db.rs), [directorio privado](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/util/misc.rs).

### 3.1 La API que ya tenemos no es un servidor

`mostro-cli api` es una interfaz de consola con respuesta JSON `schema_version: 1`. Implementa `capabilities`, `trade-status`, `fiat-sent` y `restore`. `trade-status` devuelve el estado **persistido localmente**, no una consulta autoritativa en tiempo real al nodo. `fiat-sent` exige una respuesta coincidente, salvo el caso que ya figura confirmado localmente. [Implementación del contrato](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/cli/api.rs).

No hay un servicio HTTP multiusuario en ese contrato. Muchas otras acciones de Mostrico siguen utilizando comandos y parsers de texto. Hay que ampliar el contrato estructurado antes de tratarlo como una interfaz pública estable. [Comandos actuales](../lib/mostro/commands.ts), [adaptador JSON](../lib/mostro/machine-api.ts).

## 4. Qué hace la app móvil

### 4.1 MostroP2P/mobile: identidad local, sesiones por trade

Mobile usa `FlutterSecureStorage` para mnemonic/master key y preferencias locales para el índice de derivación. Esta observación no demuestra protección hardware en todos los dispositivos; no se auditó cada plataforma. [KeyStorage](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/features/key_manager/key_storage.dart).

Su modelo `Session` mantiene claves en memoria y datos como índice, privacidad, rol, orden y contraparte. Su representación persistida incluye la clave **pública** de trade y el índice. El repositorio reconstruye las claves a partir de la raíz y comprueba que coincidan; también conserva sesiones hijas pendientes para órdenes por rango. No es una cookie ni una cuenta en un servidor compartido. [Modelo](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/data/models/session.dart), [persistencia de sesiones](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/data/repositories/session_storage.dart).

El cliente se comunica con relays Nostr desde el dispositivo. Restaurar implica solicitar operaciones/disputas, recuperar detalles y sincronizar el índice. Un bloqueo local coordina restauración y creación/toma de órdenes para evitar carreras dentro de la app. Ese bloqueo no coordina otro teléfono ni nuestro servidor. [Servicio Nostr](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/services/nostr_service.dart), [restauración](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/features/restore/restore_manager.dart), [bloqueo de ciclo de sesión](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/shared/providers/session_lifecycle_lock_provider.dart).

Para push registra una asociación entre clave pública de trade y token de dispositivo, con contexto de nodo cuando corresponde. HTTPS protege el transporte, pero el servicio receptor conoce esa asociación. No debemos presentar las notificaciones como libres de metadatos. [PushNotificationService](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/services/push_notification_service.dart).

### 4.2 MostroP2P/app: una alternativa de reutilización

Este repositorio también merece seguimiento: su núcleo Rust usa `mostro-core`, `nostr-sdk` y `flutter_rust_bridge`; selecciona SQLite en nativo e IndexedDB en WASM. Tiene operaciones, streams de actualizaciones y código de restauración. Por tanto, no hay que asumir que debemos mantener toda la lógica únicamente en el fork del CLI. [Dependencias y targets](https://github.com/MostroP2P/app/blob/7e18110be168f5a1ff31dadcdf45bbf1065adfc2/rust/Cargo.toml), [operaciones](https://github.com/MostroP2P/app/blob/7e18110be168f5a1ff31dadcdf45bbf1065adfc2/rust/src/api/orders.rs).

**No es un SDK multiusuario listo para enchufar a Next.js.** El estado de identidad y la DB contienen singletons globales. Para reutilizarlo como servidor compartido habría que convertirlos en contextos explícitos o mantener un proceso por identidad. El puente Flutter tampoco constituye automáticamente un paquete TypeScript/Node. [Identidad global](https://github.com/MostroP2P/app/blob/7e18110be168f5a1ff31dadcdf45bbf1065adfc2/rust/src/api/identity.rs), [DB global](https://github.com/MostroP2P/app/blob/7e18110be168f5a1ff31dadcdf45bbf1065adfc2/rust/src/db/app_db.rs).

La PoC de reutilización debe medir cobertura funcional, tamaño/carga WASM, almacenamiento seguro en navegador, requisitos de aislamiento del origen y facilidad para mantener bindings propios. La existencia del destino web no demuestra paridad funcional ni seguridad equivalente a un dispositivo nativo. El README tiene listas de progreso que no sustituyen revisar las funciones y probarlas.

Los repositorios inspeccionados declaran MIT. Al reutilizar código hay que conservar avisos y revisar también las licencias de las dependencias; no equivale a una auditoría de licencias completa. [Licencia del CLI](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/LICENSE), [Mobile](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/LICENSE), [App](https://github.com/MostroP2P/app/blob/7e18110be168f5a1ff31dadcdf45bbf1065adfc2/LICENSE).

### 4.3 Lo que debemos copiar y lo que no

Copiar la separación entre identidad y operaciones, persistir índices y sesiones pendientes, reconstruir estado verificando claves, y coordinar restauración con mutaciones. No copiar singletons a un servidor multiusuario, asumir que una sesión Flutter es autenticación HTTP ni prometer recuperación completa solo por conservar las doce palabras.

## 5. Conceptos que no deben mezclarse

| Concepto | Identifica o autoriza | Duración y recuperación |
| --- | --- | --- |
| Cuenta Mostrico | Propietario de datos y credenciales de acceso al servicio | Independiente de una operación; política de recuperación propia. |
| Sesión web | Un acceso autenticado desde navegador/dispositivo | Expira y puede revocarse sin cancelar trades. |
| Identidad Mostro | Claves y reputación según el modo elegido | Persiste entre logins; no se regenera al expirar una cookie. |
| Sesión de trade | Clave/índice, rol, contraparte y estado de una operación | Puede sobrevivir al cierre del navegador y durar hasta su resolución. |
| Nodo Mostro | Pubkey del daemon que arbitra/procesa esa operación | Debe quedar fijado para el trade. |
| Relay | Transporte/distribución de eventos Nostr | Puede cambiar; no es una identidad ni un nodo de liquidación. |
| Billetera Lightning | Paga garantías/depósitos o recibe el payout | Independiente del login y de la identidad Mostro. |

El protocolo deriva la identidad en `m/44'/1237'/38383'/0/0` y claves de operaciones en índices posteriores. El modo con reputación prueba la identidad; full privacy omite esa asociación. Esta separación debe conservarse en cualquier backend. [Gestión de claves](https://mostro.network/protocol/key_management.html).

Compartir relays no prueba usar el mismo nodo. Dos clientes pueden usar `nos.lol` y `relay.mostro.network` con diferentes pubkeys de Mostro. Para interoperar se deben comparar nodo, identidad/modo, clave e índice del trade, transporte y eventos confirmados, sin mostrar secretos.

## 6. Alternativas de arquitectura

Las complejidades de la tabla son relativas al código actual, no estimaciones de semanas.

| Opción | Ejecución y claves | Ventaja | Coste/riesgo principal | Encaje |
| --- | --- | --- | --- | --- |
| A. VPS dedicado por persona | Mostrico + CLI + datos, privados de esa persona | Reutiliza casi todo; operación sencilla | No es un SaaS compartido; quien administra el host puede acceder a claves | Uso personal/equipos de confianza |
| B. Instancia aislada por usuario | Un conjunto web/CLI/volumen por usuario, gateway común | Aislamiento comprensible para una beta | Más RAM y despliegues; administrador sigue siendo de confianza | Primer piloto administrado |
| C. Web compartida + workers CLI | API web común; worker y almacenamiento privados por identidad | Aprovecha el fork y separa frontend de ejecución | Hay que implementar tenancy, cola durable y supervisión de procesos | Evolución incremental administrada |
| D. API Rust persistente | Servicio de dominio extraído del CLI o biblioteca reutilizada | Conexiones persistentes, eventos estructurados, menos arranques | Refactor considerable; contextos y keystore no existen por añadir HTTP | Servicio administrado a largo plazo |
| E. Web alojada + conector local | CLI y claves en equipo del usuario | Mantiene claves fuera del servidor de Mostrico | Instalación/emparejamiento; equipo debe estar disponible | Usuarios que quieren CLI local |
| F. Cliente web directo | Firma y Nostr en navegador/dispositivo | Menos backend privado; se aproxima al modelo móvil | XSS, recuperación, persistencia y segundo plano web | Objetivo de claves locales |
| G. Firmante externo | Firma en extensión, aplicación o bunker | Evita entregar la semilla al backend | Compatibilidad HD y firmas Mostro no garantizada por NIP-07/46 | Investigación, no sustituto inmediato |
| H. Híbrido | Mercado público común; operaciones mediante C, E o F | Permite evolucionar sin imponer un único modo | Mayor matriz de soporte y mensajes de confianza claros | Dirección de producto recomendada |

### 6.1 A y B: usar el CLI directamente, con aislamiento real

**A:** una VM por persona, acceso privado mediante VPN o gateway autenticado, y una única identidad autorizada. Es una instalación personal remota, no un servidor donde invitados puedan operar con identidades independientes.

**B:** un gateway enruta al usuario autenticado hacia su instancia. Cada instancia tiene su propia configuración, usuario del sistema, `HOME`, SQLite, estado web y cachés. No compartir un volumen de semillas y elegir una fila según un parámetro recibido del navegador.

Para este piloto:

- La identidad del gateway debe determinar el destino; jamás confiar en un header de usuario enviado por el cliente. Eliminar headers entrantes que el proxy vaya a establecer.
- Aislar instancias por origen o controlar estrictamente cookies host-only y políticas de origen. Un subdominio no sustituye permisos del filesystem.
- Un solo proceso escritor por instancia. No activar réplicas Node/PM2 compartiendo los archivos actuales.
- Aprovisionar una identidad nueva explícitamente; nunca clonar nuestro `HOME`, DB o backup real para dar de alta a otra persona.
- Publicar también la limitación de confianza: contenedores distintos no impiden que el administrador del host inspeccione memoria o disco.

B reduce el refactor de tenancy, pero no exime de CSRF, control de acceso, manejo seguro de timeouts, backups y confirmaciones. Abrir la aplicación actual detrás de una contraseña genérica no satisface esos requisitos.

### 6.2 C: Mostrico compartido, CLI como worker

La web autentica, autoriza y crea trabajos durables. Un supervisor entrega cada trabajo únicamente al worker de la identidad correspondiente. Ese worker ejecuta un binario fijado y una lista de acciones permitidas, nunca un comando arbitrario.

El runner necesita un contexto inmutable con propietario, identidad, nodo, rutas autorizadas y configuración. Se pasa un objeto `env` diferente al crear el hijo. **No modificar `process.env.HOME` entre requests.** En Linux se debe validar que el CLI resuelva efectivamente el directorio privado; a medio plazo agregar al fork una opción explícita de perfil/directorio y probarla.

`MOSTRO_CLI_DB_PATH` es hoy una configuración de lectura del chat de Mostrico, no un selector implementado por el CLI. Cambiar solo esa variable puede hacer que chat y comandos utilicen identidades distintas. Mantener una única resolución de perfil para ambos.

La web compartida no debería montar la carpeta con todas las semillas. El worker debe asumir chat, descifrado y acceso a la DB. Conservamos el aislamiento aun si una sola API coordina cientos de cuentas. La autorización sigue siendo necesaria tanto en el coordinador como al entregar el trabajo.

### 6.3 D: convertir el CLI en una API de dominio

Separar responsabilidades, con nombres orientativos, no paquetes existentes:

| Capa propuesta | Responsabilidad |
| --- | --- |
| Biblioteca cliente | Claves, protocolo, sesiones, validación, transporte y almacenamiento mediante interfaces explícitas. |
| CLI | Adaptador de consola sobre la biblioteca; sigue útil para administración personal y pruebas. |
| Servicio privado | Autorización de capacidades internas, lifecycle de workers, operaciones asíncronas y stream de eventos. |
| Mostrico | Autenticación web, UX, autorización del usuario y traducción del contrato de dominio. |

Empezar con un daemon **por identidad** permite conexiones persistentes sin introducir enseguida múltiples secretos en un mismo proceso. Un daemon multiidentidad solo después de eliminar estado global y probar aislamiento. El fork actual modifica variables de entorno durante configuración/selección de transporte; eso no es un contexto seguro para solicitudes concurrentes. [Inicialización del CLI](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/cli.rs).

Contrato mínimo de la biblioteca/API:

- Capacidades/versiones, consulta de mercado y detalles, creación/toma de órdenes, fiat enviado, liberación, cancelación, disputa y rating.
- Invoices iniciales y de reemplazo, garantías/devoluciones, restauración y sincronización del índice.
- Estado confirmado versus observado localmente, acciones disponibles por rol y eventos con procedencia.
- Chat y streams incrementales con cursor, cancelación de suscripciones y reconexión.
- Errores tipados: rechazado, no autorizado, conflicto de estado, dependencia no disponible y resultado desconocido.

No implementar `POST /exec`, rutas de importación de DB arbitrarias ni parámetros libres del shell. La API no debe exponer `ADMIN_NSEC` ni comandos de solver. Si se necesita operar nuestro propio nodo Mostro, es otro servicio y otro modelo de privilegios.

### 6.4 E: conector local con CLI

Mostrico puede alojar la interfaz mientras un agente instalado por el usuario conserva CLI, DB y firma. Preferir un canal saliente autenticado del agente hacia el servicio, con emparejamiento de un solo uso, claves de dispositivo, expiración, revocación y scopes por identidad/acción.

El agente verifica destinatario, origen autorizado, nonce, vigencia y contenido exacto. Las acciones sensibles requieren aprobación vinculada a la operación. La nube no puede convertir un permiso de consulta en uno para liberar sats. No exponer un shell ni un HTTP local sin autenticación; llamadas desde una web a localhost requieren además resolver restricciones del navegador, CORS, CSRF y DNS rebinding.

**Claves locales no implica automáticamente chat privado frente a la nube.** Si el agente envía texto descifrado al backend, este puede leerlo. Para evitarlo, entregar datos privados por un canal cifrado de extremo a extremo agente-navegador; el servidor solo transporta. Una web comprometida todavía puede alterar lo que muestra o solicita firmar, por lo que el agente debe presentar los datos críticos de forma confiable.

Con el equipo apagado la operación del nodo puede continuar, pero no prometemos firma, recepción local ni notificaciones completas. Mostrar el estado del conector y no dar por enviado un comando que solo quedó esperando al dispositivo.

### 6.5 F y G: navegador, biblioteca Rust y firmantes

Para F, servir el frontend por HTTPS y mover protocolo/firmas al cliente. Evaluar reutilización del núcleo Rust de App mediante bindings WASM o una biblioteca cliente revisada; no reescribir criptografía. Cambian las rutas de Mostrico que hoy requieren Node, SQLite y procesos locales. Un export estático de la app actual no resuelve esas dependencias.

Diseñar una bóveda local y backups cifrados con mecanismos revisados. IndexedDB ofrece persistencia, no por sí sola protección de secretos frente a JavaScript del mismo origen. Evitar scripts de terceros en superficies de firma, revisar CSP, actualizaciones, bloqueo local y pérdida/borrado de datos. Un PIN visual no cifra una semilla. Las limitaciones de segundo plano deben medirse por navegador, especialmente en móvil.

Para G, NIP-07 ofrece firma de eventos y capacidades opcionales de cifrado; NIP-46 permite un firmante remoto. Ninguno define por sí solo la derivación HD Mostro ni una API general de firma del payload usado en la prueba de identidad. Compatibilidad con Nostr no basta para garantizar compatibilidad Mostro. [NIP-07](https://github.com/nostr-protocol/nips/blob/master/07.md), [NIP-46](https://github.com/nostr-protocol/nips/blob/master/46.md).

Una PoC debe demostrar derivación por índice, firmas de mensaje/prueba, cifrado/descifrado y chat sin exportar semillas. Tal vez requiera un agente firmante específico de Mostro. Un bunker controlado por Mostrico simplemente cambia dónde alojamos la clave; no elimina esa delegación.

## 7. Sesiones web y autorización propuestas

### 7.1 Login no es importar una semilla

Para C/D, proponer una cuenta pseudónima con passkeys usando una implementación mantenida, pendiente de una evaluación específica de compatibilidad, recuperación y privacidad. Admitir varias credenciales por cuenta y revocación por dispositivo. No exigir correo o asociar perfiles Nostr sociales sin una decisión de producto.

Una alternativa es autenticación por firma Nostr. NIP-98 vincula la autorización HTTP a URL, método y tiempo, y contempla el hash del cuerpo. En nuestro diseño serían obligatorias validación de firma, hash para mutaciones y defensa contra replay/challenge de un solo uso. No demuestra propiedad de una identidad Mostro distinta ni debe firmarse automáticamente con una clave de trade. [NIP-98](https://github.com/nostr-protocol/nips/blob/master/98.md).

Nunca usar las doce palabras como contraseña de login. En el modo administrado, importar/exportar una identidad sería un flujo independiente, sensible y explícitamente consentido. Si el requisito es que el servidor no reciba semillas, ese flujo debe ocurrir únicamente en el dispositivo.

La importación debe validar y preparar la identidad en un perfil de staging, sin sobrescribir la cuenta activa ni su DB. Comprobar identidad esperada, nodo y datos recuperables antes de activarla. Si una identidad ya está registrada con otro propietario en el servicio, no fusionar cuentas ni revelar su existencia automáticamente: resolver mediante un procedimiento de recuperación revisado. Una pubkey recibida del navegador nunca prueba control de sus claves.

### 7.2 Política de sesión

Usar un identificador opaco de alta entropía en una cookie `__Host-mostrico_session`, con `Secure`, `HttpOnly`, `Path=/`, sin `Domain` y `SameSite=Lax` como punto de partida. Guardar su hash y estado revocable en servidor. Rotar al autenticar o cambiar privilegios; no guardar tokens de sesión en URLs o localStorage. [OWASP: sesiones](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Parámetros **propuestos para evaluar**, no impuestos por Mostro: 256 bits aleatorios, 30 minutos de inactividad, 12 horas de vigencia absoluta y reautenticación reciente de hasta 5 minutos para liberación, reemplazo de destino de cobro, exportación o cambios de recuperación. Ajustar con pruebas de UX; el polling automático no debe mantener viva indefinidamente una sesión inactiva.

En mutaciones, validar origen y token CSRF ligado a sesión. `SameSite` es una defensa adicional, no una autorización de operaciones. Aplicar también la política al canal en tiempo real y no aceptar CORS comodín con credenciales. [OWASP: CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

### 7.3 Regla de acceso

Resolver el usuario desde una credencial verificada y comprobar que puede usar la identidad y participar en la operación. Un UUID válido o `confirmed: true` no demuestra propiedad. Las claves de acceso privado incluyen:

`owner_id + identity_id + mostro_pubkey + order_id`

La orden pública puede tener participantes distintos; cada uno necesita su propio registro privado, rol y claves. No hay una única fila privada global por UUID. Si se habilitan varias identidades por cuenta, cada request lleva una selección autorizada explícita; una pestaña no debe cambiar silenciosamente la identidad de otra.

En una base compartida, combinar comprobaciones de servicio, claves foráneas compuestas y políticas de aislamiento por fila cuando correspondan. El tenant no se obtiene de un header libre o del body. Separar cachés públicas de privadas y prohibir caching compartido de sesión, chat, invoices, restore y streams. [OWASP: seguridad multi-tenant](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html).

Recomendación inicial: una identidad y un nodo operativo por cuenta de beta. No prometer multiidentidad/multinodo hasta migrar toda la persistencia. Aun así, conservar esos identificadores en el modelo para no volver a depender de globals.

### 7.4 Logout, recuperación y eliminación

| Evento | Comportamiento propuesto |
| --- | --- |
| Cerrar pestaña | No cancelar ni eliminar operaciones; el worker administrado puede seguir recibiendo eventos. |
| Expirar login | Bloquear nuevas acciones; conservar estado de trades y pedir autenticación. |
| Logout | Revocar sesión y streams privados; limpiar vistas privadas y bloquear la bóveda local cuando exista. No borrar semilla ni cancelar automáticamente. |
| Comando pendiente sin publicar al revocar sesión | Cancelar y exigir nueva autorización, salvo una delegación explícita separada. |
| Comando ya publicado | No asumir que puede deshacerse; seguir reconciliando su resultado. |
| Perder una passkey | Recuperar acceso con otra credencial/mecanismo aprobado; no cambiar identidad Mostro. |
| Perder datos del cliente | Restaurar identidad y operaciones según protocolo y backups disponibles. |
| Eliminar cuenta con operaciones abiertas | Informar consecuencias, facilitar migración y resolver continuidad antes de destruir claves; política final pendiente. |

Desvincular notificaciones de un dispositivo al revocarlo. Retener solo lo necesario y hacer explícita la política de eliminación de históricos y copias de seguridad.

## 8. Concurrencia e interoperabilidad entre dispositivos

Las dos pestañas del mismo usuario pueden leer simultáneamente, pero la creación/toma/restauración deben pasar por un **único escritor por identidad**. Un lock por orden no basta: distintas órdenes comparten el contador de derivación. El CLI calcula el siguiente índice a partir del almacenado; no ofrece un coordinador distribuido. [Índices del CLI](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/db.rs).

Para workers administrados, usar una concesión de ejecución con generación/fencing, reserva durable de índices y registro de trabajo antes de publicar. No implementar exclusión solo con un mutex Node o un TTL Redis. Como el nodo externo no valida nuestro fencing token, el supervisor debe impedir que un worker antiguo siga firmando/publicando antes de promover un reemplazo. Si no puede demostrarlo, detener mutaciones.

**Ese bloqueo no controla un móvil externo que importó la misma semilla.** No existe en el código inspeccionado un lock compartido universal entre clientes. La política inicial debe ser un dispositivo/servicio escritor activo por identidad; el resto, consulta o transferencia explícita del control.

Transferencia propuesta: pausar mutaciones en origen, resolver publicaciones inciertas, sincronizar operaciones e índice, activar el destino y comprobar identidad/nodo. No prometer migración transparente de sesiones full privacy ni asumir que cerrar una web detiene un móvil. Una identidad nueva evita compartir el contador, pero tiene otra reputación y no hereda automáticamente las operaciones anteriores.

Para recuperar el índice, consultar `last-trade-index` además de los trades activos y mantener el máximo durable conocido. Las operaciones finalizadas también pueden haber consumido índices: el máximo de una lista de restauración no basta. [Protocolo del índice](https://mostro.network/protocol/last_trade_index.html). Si hay evidencia contradictoria o incompleta, bloquear nuevas derivaciones y reconciliar; no probar índices a ciegas sobre operaciones reales.

## 9. Comandos asíncronos, idempotencia y estado

### 9.1 Contrato web orientativo

Rutas propuestas, **no existentes**:

| Ruta | Resultado |
| --- | --- |
| `GET /api/v1/market` | Datos públicos verificados, nodo y frescura; sin activar una identidad privada. |
| `GET /api/v1/identities/{identityId}/trades` | Proyección privada autorizada, rol y última evidencia. |
| `POST /api/v1/identities/{identityId}/commands` | Valida acción y devuelve `202` con `commandId`; no afirma liquidación. |
| `GET /api/v1/commands/{commandId}` | Estado del trabajo autorizado para su propietario. |
| `GET /api/v1/events` | SSE privado, con cursor y revocación. |

Cada comando incluye acción tipada, orden cuando exista, nodo fijado, versión esperada del estado, payload validado y `Idempotency-Key`. Las confirmaciones sensibles se vinculan al hash de esos datos mediante una autorización de un solo uso. No se recibe una ruta de DB, executable ni flags CLI del navegador.

La clave idempotente se almacena con propietario, identidad, acción y hash del payload. Repetir clave/cuerpo devuelve el mismo trabajo; repetir clave con otro cuerpo devuelve conflicto. `409` para estado incompatible, `401/403` para acceso, `429` para cuotas y errores de validación distinguibles. No convertir todos los errores en "el nodo falló".

### 9.2 Estados que debe distinguir el sistema

| Estado del comando | Significado |
| --- | --- |
| `queued` | Intención autorizada y persistida, aún no publicada. |
| `running` | Worker con exclusión y precondiciones en revisión. |
| `published` | Hay evidencia de envío/publicación; no confirma aceptación por Mostro. |
| `acknowledged` | Respuesta válida del nodo correlacionada con la acción. |
| `rejected` | Rechazo explícito verificable. |
| `unknown` | Timeout/caída deja un resultado ambiguo; requiere reconciliación. |
| `cancelled` | Cancelado antes de publicar; no implica cancelación de la orden. |

`acknowledged` es distinto de pago recibido. El estado de comando no sustituye el estado del trade, la garantía ni el payout. Persistir por separado estado de protocolo, siguiente acción de UI y evidencia de liquidación.

### 9.3 Garantías realistas

1. Persistir intención, autorización, correlación y reserva de índice antes de la publicación.
2. Serializar por identidad y volver a validar rol, nodo, estado e invoice al ejecutar.
3. Firmar cerca del envío, no encolar eventos firmados durante minutos. El protocolo tiene ventanas de frescura y requisitos PoW que hay que respetar.
4. Registrar eventos entrantes verificando firma, autor esperado, destinatario, orden y correlación disponible. Algunas respuestas no llevan `request_id`; usar la semántica específica del protocolo, sin inventarlo.
5. Ante caída/timeout, reconciliar DB, journal y eventos antes de autorizar otro intento. Aceptación de un relay o salida cero del proceso no prueban que el nodo ejecutó la acción.
6. No prometer ejecución exactamente una vez entre nuestra DB y un nodo externo. Idempotencia HTTP limita duplicados del navegador, no crea idempotencia en Mostro.

Un journal/outbox durable ayuda, pero hay una ventana inevitable entre publicar y registrar la respuesta. No reintentar ciegamente liberaciones, creación de órdenes o reemplazos de invoice. Un reenvío permitido por el protocolo debe respetar frescura y defensa de replay, sin reinterpretar silencio como prueba de que el primer envío no ocurrió. [Migración y transporte](https://mostro.network/protocol/transport_migration.html).

Para CLI directo, el supervisor debe esperar la salida del hijo después de `SIGTERM`, escalar de forma acotada si no termina y confirmar que no quedan procesos capaces de publicar antes de liberar la identidad. Durante despliegues, drenar trabajos; no matar procesos y lanzar duplicados como recuperación automática.

## 10. Datos, secretos y fuentes de verdad

Modelo lógico propuesto para C/D:

| Entidad | Contenido | Protección |
| --- | --- | --- |
| `users`, `credentials`, `web_sessions` | Cuenta, passkeys, sesiones hash/revocación | DB del servicio; ninguna semilla. |
| `identities` | Propietario, pubkey, modo, referencia de worker y política de firma | Acceso autorizado; no depender de la pubkey como secreto. |
| `identity_secrets` o keystore | Material cifrado y referencia de clave de envoltura | Solo componente autorizado a firmar; separar de la DB web cuando sea posible. |
| `node_bindings` | Pubkey Mostro, relays, transporte/capacidades verificadas | Configuración validada y versionada. |
| `trade_sessions` | Identidad/nodo/orden, índice, rol, parentesco y contraparte | Claves compuestas; metadatos privados por participante. |
| `commands`, `key_reservations` | Intención, correlación, estado y contador máximo consumido | Durables; unicidad y exclusión transaccional. |
| `events`, `trade_projections` | Evidencia recibida, cursor, estado derivado y frescura | Validación criptográfica; separación pública/privada. |
| `chat_messages`, `notifications` | Mensajes/cifrados según modo, recibos, suscripciones | Retención mínima; autorización por conversación/dispositivo. |

Mantener SQLite por worker durante la transición evita reescribir de entrada la persistencia interna del CLI. PostgreSQL puede alojar sesiones web, journal y proyecciones compartidas. Tener PostgreSQL no convierte la DB privada del CLI en multiusuario ni autoriza dos procesos a escribirla.

Definir qué datos son autoritativos: el nodo decide transiciones de protocolo; nuestros eventos y DB prueban lo observado; la UI calcula el siguiente paso. Conservar `observed_at`, identificador de evento, autor, versión y estado de sincronización. Ni el último poll ni un timestamp más reciente justifican deshacer una confirmación terminal válida. Conflictos se revisan según la máquina de estados.

Representar sats como enteros sin pérdida y fiat con escala decimal explícita, sin floats para cálculos monetarios. Al serializar valores fuera del rango entero seguro de JavaScript, usar strings decimales documentados. Formatear números y fechas en la UI según locale; persistir instantes UTC. Esto no añade un ticker ni precios en vivo al mercado.

### 10.1 Cifrado y autoridad de firma

En el CLI inspeccionado la mnemonic está en una columna de SQLite; permisos `0600` no son cifrado. Para B/C, empezar con volúmenes y backups cifrados, acceso exclusivo y una declaración honesta de que el worker ve el secreto. No afirmar que existe cifrado por fila en el fork.

Para D, proponer cifrado envelope por identidad con una clave de datos y una clave de envoltura administrada aparte; rotación, recuperación y acceso auditado. No derivar la clave durable de una cookie de login. El formato y la integración con un keystore requieren diseño y pruebas, no criptografía casera.

KMS o cifrado en reposo no impiden a un worker autorizado firmar ni protegen de todo compromiso del host. Tampoco asumir soporte directo de BIP32/secp256k1 en cualquier KMS. El componente con acceso a descifrar sigue dentro del perímetro de confianza.

## 11. Relays, transporte y estado en vivo

Separar un indexador público de órdenes de los listeners privados por identidad. El mercado puede consumir eventos públicos `kind 38383`, verificando autor y estructura. No necesita iniciar el CLI de un usuario para cada visitante. [Evento público de orden](https://mostro.network/protocol/order_event.html).

Los listeners privados deben mantenerse activos mientras haya operaciones relevantes, con cursores durables, deduplicación y reconexión acotada. No lanzar un `getdm` por cada pestaña cada pocos segundos. C puede comenzar con polling centralizado por identidad; D permite conexiones persistentes y eventos estructurados. Escalar por usuarios activos y volumen de mensajes, no por pestañas abiertas.

Seleccionar transporte a partir de información auténtica del nodo. Hay una diferencia concreta entre clientes inspeccionados: Mobile asume v2 si no hay versión; nuestro fork cae a gift-wrap en ausencia de información o versión desconocida. No basta con decir "mismo relay". [Mobile: resolución de transporte](https://github.com/MostroP2P/mobile/blob/637fd430a1ca548dfe6c4639ee3afb023289f8cc/lib/features/mostro/transport.dart), [CLI: resolución](https://github.com/dancardona/mostro-cli/blob/86cd798ddd08c4dda25e8dbc388f0707e241557b/src/cli.rs).

Para cloud, fijar una matriz de versiones soportadas y mostrar configuración efectiva. Una versión desconocida debe impedir mutaciones hasta aclarar compatibilidad; no enviar sucesivamente formatos distintos como prueba. Verificar también PoW y frescura antes de publicar. La documentación describe detección mediante `kind 38385` y transición de v1 a v2; no demuestra qué versión corre hoy un nodo específico. [Guía oficial de transporte](https://mostro.network/protocol/transport_migration.html).

El chat usa su propio contrato de claves/envelope: no tratar todos los eventos `kind 14` como si fueran el mismo canal. Reutilizar el adaptador probado y sus validaciones, moviendo únicamente su frontera de ejecución cuando corresponda.

### 11.1 Chat flotante y notificaciones

El chat puede estar cerrado visualmente sin detener la recepción del worker. Mantener contador de no leídos por conversación y cursor de lectura por usuario/dispositivo, actualizarlo por SSE y no marcar leído por el solo hecho de recibir push.

Con permiso explícito, Web Push puede avisar de cambios relevantes; tratarlo como best effort y recuperar estado al abrir. Payload inicial mínimo, por ejemplo "Tienes una actualización", sin texto del chat, monto, invoice o datos de contraparte. Los deep links requieren login y autorización otra vez. Si se usa el servicio push de Mostro, comprobar contrato, permisos y tratamiento de metadatos; una integración FCM móvil no es automáticamente Web Push.

En modo administrado el worker puede leer chat para procesarlo; no prometer confidencialidad frente al operador. En modo local/directo, conservar el descifrado en el dispositivo y explicar las limitaciones con el navegador cerrado.

## 12. Invoices, garantías y recuperación de pago

La billetera puede seguir siendo externa: mostrar QR, copiar o compartir una invoice no exige custodiar su billetera ni integrar NWC. Mantener distinguibles garantía antiabuso, hold invoice del vendedor, invoice de cobro del comprador y devolución de garantía; no intercambiarlas porque todas sean Lightning.

El protocolo contempla que tras liberar el vendedor falle el pago al comprador: `payment-failed` es una **acción**, no un nuevo estado de orden; durante los reintentos puede permanecer `settled-hold-invoice`, y `add-invoice` solicita un reemplazo. La UI debe separar "vendedor liberó" de "comprador recibió". [Payment Failed](https://mostro.network/protocol/payment_failed.html).

Comportamiento requerido para nuestro escenario de invoice vencida:

1. Recuperar el estado y la solicitud válida del nodo aunque haya expirado la sesión web.
2. Solicitar una invoice nueva al comprador autorizado, validando red, expiración y monto neto esperado según protocolo. No usar una cifra vieja de una card del mercado.
3. Confirmar el destino y vincular la actualización a la versión del estado y al hash de invoice.
4. Mostrar por separado envío, aceptación y pago confirmado; una respuesta del CLI no basta para declarar cobro.
5. No reabrir el formulario por un evento anterior a la sustitución. Una nueva solicitud auténtica posterior sí puede requerir otra invoice.
6. Ante fallos repetidos, mostrar evidencia disponible y ofrecer un diagnóstico redactado para el operador del nodo. No atribuir la causa a Muun u otra billetera sin logs suficientes.

No afirmar por una lectura de estado local dónde están actualmente fondos de una orden real. Los logs de Mostrico/CLI no incluyen necesariamente la causa de routing/pago del nodo Lightning remoto. Operar un frontend no concede acceso a esos logs.

NWC, si se añadiera, necesita una propuesta separada de permisos, revocación, límites y almacenamiento. No incluir credenciales de billetera en el despliegue por conveniencia.

## 13. Despliegue en VPS, nube o servidor propio

### 13.1 Qué alojar

Desplegar Mostrico y su cliente CLI **no exige operar nuestro propio daemon Mostro ni un nodo Lightning**. Podemos comunicarnos con un nodo Mostro configurado mediante relays. Montar un nodo propio añade liquidez, disponibilidad, configuración de pagos y responsabilidades operativas distintas; queda fuera de este despliegue de clientes.

| Entorno | Viabilidad | Condiciones |
| --- | --- | --- |
| VPS/VM Linux con disco persistente | Adecuado para A/B y primera C | Supervisión, TLS, aislamiento, backups y capacidad validada. |
| Servidor propio | Mismo modelo técnico | Añadir acceso remoto seguro, conectividad, energía y recuperación física. |
| Plataforma de contenedores persistentes | Adecuada para B/C/D | Volúmenes por identidad, afinidad del worker y exclusión efectiva de escritores. |
| Kubernetes | Posible, no requisito inicial | Mayor carga operativa; StatefulSets no resuelven por sí solos fencing ni secretos. |
| Frontend/BFF serverless + workers externos | Posible tras desacoplar | Estado y procesos viven fuera de la función; revisar límites reales del proveedor. |
| Edge runtime para CLI actual | No adecuado | El diseño necesita procesos Node, SQLite y filesystem durable. |
| Hosting estático | Solo para una F adaptada o mercado público separado | No ejecuta los Route Handlers actuales ni `mostro-cli`. |

No se elige proveedor ni se citan precios: faltan región, número de usuarios y presupuesto. Comparar después soporte de disco persistente, aislamiento, backups exportables, límites de conexiones, egreso y acceso a claves, además del coste mensual.

### 13.2 Topología inicial administrada

- Único punto público HTTPS: reverse proxy con límites, gateway/autenticación y Mostrico.
- Control interno: cola/journal, DB de sesiones y supervisor sin puerto público de administración.
- Por identidad: worker con un único volumen privado, configuración de nodo fijada y salida controlada a relays.
- Backups cifrados fuera del host y observabilidad sin secretos.

Next.js recomienda un reverse proxy para self-hosting y distingue cachés/variables de servidor de las públicas. Se consultó también la guía instalada en `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`, correspondiente al proyecto, antes de proponer el despliegue. [Guía Next.js](https://nextjs.org/docs/app/guides/self-hosting).

### 13.3 Checklist de operación

| Área | Requisito de diseño |
| --- | --- |
| Build | Instalar con lockfile, compilar con `npm run build` y ejecutar producción, no `next dev`. Fijar Node compatible con `node:sqlite`; la base del proyecto usa Node 24. |
| CLI | Compilar para el SO/arquitectura Linux de destino con `Cargo.lock`, fijar commit y checksum del binario; verificar dependencias nativas en CI. No copiar el binario macOS al VPS. |
| Escucha | Los scripts actuales enlazan `127.0.0.1`. Es adecuado detrás de proxy en el mismo host. Entre contenedores requiere una escucha en red privada o socket; no publicar ese puerto al exterior. |
| Frontera interna | Unix socket o canal autenticado, y mTLS/identidad de servicio entre hosts. Que una red sea privada no autoriza cualquier tenant. |
| Configuración | Separar build/runtime, datos y secretos. Nunca `NEXT_PUBLIC_` para claves, tokens o rutas privadas. No heredar el entorno completo del host en workers. |
| Permisos | Usuario sin root, raíz de contenedor de solo lectura cuando sea posible, capacidades mínimas, límites de procesos/memoria/CPU y volumen exclusivo. |
| Docker | No montar Docker socket en el frontend ni ejecutar workers privilegiados. Evaluar rootless/user namespaces; no tratar contenedores como protección frente al administrador del host. |
| Health checks | Comprobar proceso, almacenamiento esperado y capacidad de recibir trabajo; no ejecutar restore o crear identidad como prueba de salud. |
| Red | HTTPS/WSS, reloj sincronizado y egress restringido. Validar relays/URLs y bloquear destinos internos no autorizados. |
| Actualización | Drenar trabajos, guardar estado, verificar compatibilidad, migrar con backup y activar una única generación de worker. Rollback de binario no implica downgrade seguro de DB. |

El modo rootless reduce privilegios del daemon y contenedores, pero debe evaluarse con los recursos y límites reales del despliegue. [Docker: rootless](https://docs.docker.com/engine/security/rootless/).

### 13.4 Capacidad y alta disponibilidad

No asignar un número de usuarios por VPS sin medir. En CLI por proceso, una primera aproximación es `comandos_por_segundo * duración_media` para estimar procesos concurrentes, más CPU de PoW, sockets, RAM y actividad de chat. Para cada identidad la cola es serial, por lo que latencia de un comando lento afecta a los posteriores.

Medir por separado mercado, lecturas privadas y mutaciones; combinar varias pestañas en una sola recepción por identidad. Poner cuotas por cuenta/identidad y una cola con límites para que un usuario no consuma todos los workers. Mostrar "esperando ejecución" frente a "esperando al nodo".

Escalar horizontalmente la web después de sacar sesiones/estado privado de memoria. Para firmas, preferir worker activo/pasivo con almacenamiento recuperable. Nunca dos réplicas activas con el mismo `HOME`. Sin fencing demostrable, una partición de red debe sacrificar disponibilidad de mutaciones, no la consistencia de identidad.

Objetivos a definir antes del piloto: latencia de aceptación de trabajo, edad máxima de estado mostrado, tiempo de recuperación y pérdida máxima de datos tolerable. No presentar disponibilidad, RPO o RTO contractuales hasta probar restores y fallos.

## 14. Backups, restauración y continuidad

`restore-session` recupera operaciones y disputas que el nodo puede asociar a la identidad; no sustituye un backup íntegro de historial, chat, comandos pendientes y configuración. [Restore Session](https://mostro.network/protocol/restore_session.html). Las órdenes full privacy no se recuperan mediante la restauración de cuenta basada en identidad fija; necesitan conservar sus datos de sesión. [Backup y full privacy](https://mostro.network/docs-english/backup-restore.html).

El conjunto recuperable debe incluir keystore/semilla bajo la política elegida, SQLite del CLI, metadatos privados de Mostrico, índices/reservas, journal de comandos y cursor de eventos. Guardar manifiesto con identidad esperada, nodo, revisiones de aplicación/CLI y esquema. Las claves para descifrar backups necesitan su propio plan de recuperación.

No copiar solamente `mcli.db` mientras escribe el proceso y asumir que es consistente. Usar la API de backup de SQLite o un procedimiento de parada/snapshot coherente que contemple el journal/WAL. Coordinar además el corte con el estado web y el journal externo: una copia consistente de SQLite no hace atómicas dos bases distintas. [SQLite Online Backup API](https://www.sqlite.org/backup.html).

Procedimiento propuesto de recuperación:

1. Detener/probar la detención del escritor anterior y bloquear mutaciones.
2. Restaurar en un entorno aislado; verificar permisos, identidad esperada, descifrado e integridad.
3. Comparar índice durable y reservas con información válida del nodo. No bajar el contador ni deducirlo solo de órdenes activas.
4. Recuperar eventos y reconciliar comandos `running/published/unknown`; no republicarlos automáticamente.
5. Mostrar operaciones, pendientes de invoice y disputas al propietario; reabrir mutaciones solo si la reconciliación es suficiente.
6. Registrar el simulacro sin semillas, invoices completas ni chat en logs.

No prometer restaurar reputación o todos los datos privados si se perdió material necesario. En C/D, una caída del login no debe interrumpir recepción de eventos; una pérdida de claves sí requiere un tratamiento de incidente distinto.

## 15. Riesgos y controles antes de abrir al público

| Riesgo | Control requerido | Riesgo residual |
| --- | --- | --- |
| Usuario A consulta/libera trade de B | Autorización por participante en rutas, repositorios, trabajos y streams; pruebas IDOR | Bugs de autorización siguen requiriendo auditoría. |
| Mezcla de identidades por env/DB/caché | Contextos inmutables, volúmenes separados y claves compuestas | Un proceso multiidentidad aumenta el impacto de una falla. |
| Compromiso del host | Mínimos privilegios, aislamiento, parches, cifrado, accesos auditados | Un host con autoridad de firma puede actuar como usuario. |
| CSRF/XSS/robo de sesión | Cookie segura, CSRF/origen, CSP, render seguro y reautenticación | XSS puede operar dentro de una sesión o comprometer un firmante web. |
| Doble publicación o índice reutilizado | Journal durable, único escritor, fencing efectivo y reconciliación | La red externa no da transacciones exactamente una vez. |
| SSRF mediante relays u otras URLs | Allowlist inicial, validación de DNS/IP/destino y egress; controlar redirecciones | Cambios de DNS y redes requieren verificación continua. |
| Secretos en logs, argv o soporte | Redacción, límites de salida, no semillas por argv; proponer payload JSON por stdin para acciones sensibles | Usuarios con acceso al proceso pueden inspeccionar memoria; no compartir UID. |
| Abuso/DoS/PoW | Cuotas por identidad, límites de trabajos, timeouts y backpressure | Un relay/nodo ajeno puede degradarse o bloquear tráfico. |
| Backup equivocado o corrupto | Identidad esperada, restores de prueba y backup coherente | Restore de protocolo no reconstruye todo. |
| Cadena de suministro | Versiones fijadas, CI, revisión de actualizaciones, checksum/procedencia | Firmar con software comprometido sigue siendo peligroso. |
| Filtración de chat/metadatos | Retención mínima, push discreto y acceso limitado | En modo administrado el operador está en el extremo de descifrado. |

No solicitar ni aceptar `ADMIN_NSEC` en el hosting de usuarios. No ejecutar comandos que paguen, liberen o cambien invoices desde health checks, cron de mantenimiento o pruebas de infraestructura. Cualquier automatización futura de operaciones financieras exige una autorización de producto independiente y límites explícitos.

El modelo administrado también necesita revisión especializada sobre responsabilidades y obligaciones aplicables según jurisdicción. Este documento describe autoridad técnica, no determina una clasificación legal ni ofrece garantías sobre fondos.

## 16. Matriz de escenarios funcionales y de fallo

| Escenario | Resultado esperado en cloud |
| --- | --- |
| Visitante anónimo abre mercado | Solo ofertas públicas verificadas; no se crea una semilla ni se consulta una identidad privada. |
| Alta de dos usuarios | Identidades, rutas, volúmenes y cachés diferentes; ninguno recibe nuestra cuenta actual. |
| Dos pestañas crean/toman al tiempo | Reserva durable y serialización por identidad; sin reutilización de índice. |
| Crear compra/venta como maker | Conservar intención y claves aun antes de recibir un `orderId`; correlacionar confirmación. |
| Tomar oferta fija o de rango | Validar importe, rol y estado otra vez al ejecutar; manejar oferta ya tomada sin crear un trade fantasma. |
| Orden de rango genera hija | Persistir relación padre/hija y clave reservada antes de depender de una respuesta futura. |
| Pagar garantía antiabuso | QR/copiar/compartir disponibles; avance solo por evidencia válida, no por cerrar el modal. |
| Garantía vence, se devuelve o se penaliza | Mostrar evento y plazo del nodo; no confundir devolución de garantía con cobro de compra. |
| Vendedor paga hold invoice | Estado independiente del pago fiat y del login; nunca marcar pagado por intención del usuario. |
| Comprador marca fiat enviado | Confirmación ligada al trade; distinguir publicado de `fiat-sent-ok`. |
| Vendedor libera y comprador aún no recibe | Mantener payout pendiente; no mostrar compra completada solo por liberación. |
| Invoice de cobro vence o falla | Solicitar reemplazo cuando corresponda al estado/evento del nodo; conservar monto neto y correlación. |
| Llega solicitud vieja de invoice | No retroceder el estado ni sobrescribir una invoice posterior aceptada. |
| Misma clave idempotente se reenvía | Mismo resultado/trabajo; otro payload con esa clave se rechaza. |
| HTTP expira después de publicar | Mostrar resultado desconocido y reconciliar, no ejecutar nuevamente en automático. |
| Worker cae entre firma, envío y ack | Recuperar journal y claves; bloquear escritor de reemplazo hasta controlar al anterior. |
| Nodo/relay no responde | Indicar último estado observado y desconexión; no deducir cancelación, éxito o pérdida de fondos. |
| Transporte/PoW incompatible | Diagnóstico de capacidades y bloqueo de mutaciones incompatibles; no repetir formatos a ciegas. |
| Chat cerrado o pestaña en segundo plano | Recepción independiente donde el modo lo permita; no leídos y push con permiso. |
| Logout con una operación abierta | Revocar acceso, no identidad; reconciliar trabajos ya publicados. |
| Cancelación, disputa o rating | Autorizar por rol/estado y conservar evidencia; comandos de admin fuera del alcance. |
| Importar misma semilla en móvil y web | Advertir límite de escritor único y realizar transferencia controlada; no prometer sincronización completa. |
| Restaurar después de perder el equipo | Reconstruir lo soportado por nodo/backup y sincronizar índice sin retroceder. |
| Full privacy sin backup de sesiones | Informar limitación; no ofrecer un falso "recuperado todo". |
| Cambiar de nodo o relays | Conservar el nodo de cada operación; relays cambian transporte, no transfieren trades. |
| Importación falla o coincide con otra cuenta | No sobrescribir identidad activa ni fusionar propietarios; mantener el perfil anterior y resolver recuperación sin filtrar datos. |
| DB ausente/corrupta o backup de otra cuenta | Worker no saludable; nunca generar una identidad sustituta silenciosa. |
| Agente local apagado | Sin capacidad de firma local; mostrar offline y requerir vigencia/autorización al reconectar. |
| Acceso directo al UUID de otro usuario | Denegar sin filtrar existencia, importes, mensajes, invoices o claves privadas. |
| Fallo de push | El estado se recupera desde eventos al abrir; no depender de la entrega del aviso. |
| Incidente o cierre del servicio | Plan de salida/backup, continuidad de trades y guía de migración; no destruir material de recuperación por sorpresa. |

La matriz es el mínimo conocido, no una promesa de cubrir futuras acciones del protocolo. Añadir escenarios al actualizar CLI, App, Mobile o el nodo soportado.

## 17. Plan incremental propuesto

### Fase 0: decidir confianza y publicar solo lectura

Elegir explícitamente si aceptamos alojar claves. Separar el lector público de mercado de `MostroService` con identidad y comprobar que ninguna ruta privada queda alcanzable desde ese despliegue. No basta con ocultar botones. Documentar nodo/capacidades soportados y no modificar el modo local existente.

### Fase 1: beta cerrada aislada, si se aprueba el modo administrado

Una instancia por persona, autenticación fuerte, identidades nuevas, almacenamiento privado y backups probados. Corregir timeout/terminación, corrupción de estado y preflight de identidad. Pruebas con fixtures o entorno de ensayo, sin reutilizar operaciones reales. Sin importación general de semillas ni autoservicio abierto hasta revisar el flujo sensible.

### Fase 2: workers y contrato estructurado

En Mostrico: introducir contexto autenticado, repositorios con propietario/identidad/nodo, journal e idempotencia, proyecciones privadas, jobs y streams. Mover chat/DB privada al worker.

En el fork: perfil/directorio explícito, entrada/salida JSON estable para todas las acciones usadas, errores tipados, confirmaciones correlacionadas, estado/frescura y eventos incrementales. Eliminar parsers de texto del camino crítico antes de escalar.

### Fase 3: API persistente o núcleo compartido

Comparar una extracción del CLI con reutilización de módulos de `MostroP2P/app`/`mostro-core`. Hacer una PoC con identidad, create/take, restore, payout de reemplazo y chat. Medir conexiones, carga, latencia y superficie de secretos. Mantener proceso por identidad hasta demostrar que un runtime multiidentidad es seguro.

### Rama local: E/F sin alojar claves

Si se descarta autoridad de firma en el servidor, no construir primero un SaaS con semillas para luego llamarlo local. Mantener mercado público, implementar agente emparejado o cliente directo y probar recuperación, aprobación de firma y límites de segundo plano. G permanece experimental hasta demostrar compatibilidad real con el protocolo.

## 18. Criterios de aceptación antes de una apertura pública

- [ ] Decisión de confianza aprobada y mensajes de producto coherentes con dónde están las claves y quién puede leer chat.
- [ ] Pruebas de dos usuarios concurrentes que cubran HTTP, SSE, workers, cachés, filesystem y base de datos, incluyendo UUID conocido del otro usuario.
- [ ] Todas las acciones privadas exigen sesión, pertenencia, rol y precondiciones; CSRF y origen probados, no solo login de UI.
- [ ] Dos procesos/hosts no pueden publicar con la misma identidad sin exclusión demostrable; un worker antiguo no sobrevive a un failover autorizado.
- [ ] Create/take/rangos/restore no reutilizan índices, incluso ante caídas, respuestas tardías y DB restaurada.
- [ ] Salida del CLI, ack de relay, ack de Mostro y cobro real se muestran como cosas distintas.
- [ ] Pruebas del ciclo `payment-failed`/`add-invoice`, invoice vencida, monto incorrecto, evento viejo y confirmación tardía.
- [ ] Versiones y transportes soportados tienen fixtures/contratos y un smoke test en entorno de ensayo controlado.
- [ ] Reinicio, disco lleno, corrupción, ausencia de volumen y timeout no generan semillas nuevas ni pierden silenciosamente el estado.
- [ ] Backup/restauración completa ensayados; RPO/RTO medidos y claves de descifrado recuperables.
- [ ] Pruebas de carga con relays simulados y cuotas; consultas privadas no crean un proceso por pestaña sin límites.
- [ ] Búsqueda de secretos en logs/artifacts/errores, revisión de dependencias y revisión de seguridad del modo cloud.
- [ ] Logout/revocación corta streams y acceso; no cancela trades ni republica trabajos ambiguos.
- [ ] Política de soporte, notificaciones, retención, migración y cierre del servicio documentada.

Los tests de este diseño deben usar identidades sintéticas y simulación de respuestas. Una prueba con un nodo real requiere un entorno acordado y no debe emitir órdenes, liberar sats o pagar invoices reales como efecto colateral de CI.

## 19. Decisiones pendientes

1. ¿Mostrico puede conservar claves de firma o el requisito es que permanezcan siempre en el dispositivo?
2. ¿Primero acceso privado por invitación, self-hosting personal o producto público de autoservicio?
3. ¿Una identidad/nodo por cuenta inicialmente? ¿Qué nivel de uso simultáneo con Mobile queremos soportar realmente?
4. ¿Passkeys y recuperación pseudónima son suficientes? ¿Qué datos personales estamos dispuestos a relacionar con una identidad?
5. ¿Qué garantías de disponibilidad, usuarios activos, región y presupuesto justifican workers persistentes o API Rust?
6. ¿Queremos mantener el fork, contribuir interfaces a upstream o reutilizar módulos de App? Confirmar prioridades y estabilidad con el equipo Mostro.
7. ¿Cómo será la salida del servicio y el backup portable, especialmente para sesiones full privacy y operaciones todavía abiertas?

**Decisión recomendada para empezar:** mercado público sin identidad y una PoC de aislamiento con CLI para una beta privada, condicionada a aceptar explícitamente la administración de claves. Mantener en paralelo una evaluación acotada del núcleo Rust/WASM oficial. No abrir el Mostrico actual como servidor compartido ni importar semillas de otros usuarios antes de resolver esa decisión.
