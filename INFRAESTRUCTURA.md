# Infraestructura del Hub — herramientas, costos y alternativas

Registro de referencia para decisiones de infraestructura del hub (UDP + áreas futuras: Negocios, Finanzas, Tareas, Jarvis). Precios consultados en junio de 2026; revisar antes de comprometerse porque estos servicios cambian de precio con frecuencia.

## Tu hardware (referencia para las opciones self-hosted)

PC de escritorio: Ryzen 3 3600x (6 núcleos / 12 hilos) · Asus B-350M · GTX 1650 Super (4 GB VRAM) · 16 GB DDR4 2666MHz · 1 TB NVMe + 500 GB SSD.

Lectura rápida: la CPU es de sobra para servir un sitio estático y un backend pequeño 24/7. Los 16 GB de RAM alcanzan para correr varios servicios ligeros a la vez, pero no es una máquina pensada para ser servidor permanente sin que compita con tu uso normal del PC. La GTX 1650 Super con 4 GB de VRAM es la limitación real: alcanza para modelos de lenguaje pequeños (3B parámetros o menos, cuantizados) pero no para algo del nivel de Claude o GPT en calidad de respuesta.

---

## 1. Hosting del sitio estático (lo que hoy pensamos para GitHub Pages)

| Opción | Costo | Notas |
|---|---|---|
| **GitHub Pages** | Gratis | Sin límite duro de bandwidth (soft cap ~100GB/mes), dominio propio gratis con HTTPS, repos públicos solamente. [Fuente](https://medium.com/@ferreradaniel/how-to-create-unlimited-free-websites-with-github-pages-a-complete-guide-608cfd4fffcc) |
| **Vercel (Hobby)** | Gratis | 100GB bandwidth, ~100k–1M invocaciones de funciones según la fuente, pero solo 4 horas de CPU activa al mes — se agota rápido si el proxy de Canvas/Jarvis tiene tráfico real. Pro: $20/mes. [Fuente](https://www.fencode.dev/en/blog/vercel-free-vs-pro-2026-official-limits-pricing) |
| **Netlify (Free)** | Gratis | 300 créditos/mes (no se recargan solos), funciones con timeout de 10s. [Fuente](https://flexprice.io/blog/complete-guide-to-netlify-pricing-and-plans) |
| **Cloudflare Pages + Workers** | Gratis / desde $5/mes | 100k requests/día gratis; el plan pagado ($5/mes) sube a 10M requests/mes. Es la opción más generosa si necesitas backend además del sitio. [Fuente](https://developers.cloudflare.com/workers/platform/pricing/) |
| **Self-hosted (tu PC)** | $0 + electricidad | Servir el sitio estático con `nginx`/`caddy` desde tu propio equipo. Solo tiene sentido si combinas con un túnel (ver sección 5), y tu hub deja de estar disponible si tu PC está apagado. |

**Recomendación:** GitHub Pages para el sitio estático en sí (gratis, sin mantenimiento, ya tienes cuenta). El sitio estático no necesita más que esto.

---

## 2. Proxy serverless para Canvas (y para Jarvis) — guarda el token/API key del lado del servidor

Esto es la pieza que falta: una función pequeña que reciba la petición del navegador, agregue el token de Canvas (o la API key de Jarvis) y la reenvíe, sin exponer el secreto en el HTML/JS público.

| Opción | Costo | Notas |
|---|---|---|
| **Cloudflare Workers** | Gratis hasta 100k req/día | Mi recomendación: es la más generosa, y ya la necesitas para el túnel si decides self-hostear otra cosa (ver sección 5). |
| **Vercel Functions** | Gratis (con el límite de 4h CPU/mes) | Cómodo si igual hosteas el sitio ahí, pero el límite de CPU activa es la trampa más común. |
| **Netlify Functions** | Gratis (125k invocaciones/mes) | Similar a Vercel en alcance. |
| **Self-hosted (tu PC)** | $0 + electricidad | Un servidor Node/Express corriendo en tu PC, expuesto con Cloudflare Tunnel (gratis, ver sección 5). Control total, pero depende de que tu PC esté encendido. |

**Recomendación:** Cloudflare Workers. Es gratis para este volumen de uso (un estudiante consultando su propio Canvas, no miles de usuarios) y evita el problema del límite de CPU de Vercel.

---

## 3. El "cerebro" de Jarvis (modelo de lenguaje)

| Opción | Costo aproximado | Notas |
|---|---|---|
| **Claude API (Anthropic)** | Haiku 4.5: $1 / $5 por millón de tokens (entrada/salida). Sonnet 4.6: $3 / $15. [Fuente](https://www.finout.io/blog/anthropic-api-pricing) | Para un asistente personal con uso conversacional normal, esto típicamente cuesta **centavos a pocos dólares al mes**, no más. Calidad muy superior a cualquier modelo que corra en tu GPU. |
| **OpenAI API** | GPT-5.4-nano: $0.20 / $1.25 por millón de tokens. GPT-5.5: $5 / $30. [Fuente](https://www.morphllm.com/openai-api-pricing) | Alternativa equivalente, precios similares en el segmento económico. |
| **Self-hosted con Ollama (open source)** | $0 + electricidad | Con 4 GB de VRAM solo corres modelos de ~3B parámetros o menos cuantizados (Phi-4 Mini, Gemma 2 2B). [Fuente](https://www.promptquorum.com/prompt-bites/best-ollama-models-4gb-vram) Funcionan para chat simple, pero se quedan cortos para resumir guías de estudio largas o razonar sobre varios archivos a la vez. |

**Recomendación:** Claude Haiku vía API para el "cerebro" de Jarvis. El costo real para uso personal es marginal, y la diferencia de calidad contra un modelo de 2-3B corriendo en tu GTX 1650 Super es enorme — especialmente si quieres que Jarvis lea y resuma tus apuntes. Ollama local queda como buena opción de respaldo o para experimentar sin gastar nada, pero no lo pondría como la opción principal de un asistente que depende de entender texto largo.

---

## 4. Voz para Jarvis (texto↔voz)

| Opción | Costo | Notas |
|---|---|---|
| **Web Speech API del navegador** | Gratis | `SpeechRecognition` (voz→texto) y `SpeechSynthesis` (texto→voz) ya integradas en Chrome/Edge. Calidad de voz robótica pero funcional, y no requiere nada del servidor. |
| **OpenAI Whisper / GPT-4o Transcribe (STT)** | ~$0.003–$0.006 por minuto de audio. [Fuente](https://diyai.io/ai-tools/speech-to-text/openai-whisper-api-pricing-2026/) | Transcripción mucho más precisa que la del navegador, sobre todo en español con ruido de fondo. |
| **ElevenLabs (TTS)** | Gratis: 10k créditos/mes (~10 min de audio). Starter $6/mes, Creator $22/mes. [Fuente](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/) | Voces mucho más naturales que la síntesis del navegador, pero el plan gratis no tiene uso comercial (no es problema para uso personal). |
| **Self-hosted: Whisper.cpp (STT) + Piper TTS (open source)** | $0 + electricidad | Corren bien en CPU, sin necesitar la GPU. Tu Ryzen 3600x los mueve sin problema para clips cortos. Privacidad total: el audio nunca sale de tu PC. |

**Recomendación:** Empieza con la Web Speech API (gratis, cero configuración) para validar que quieres usar voz de verdad. Si la calidad te frustra, el siguiente paso más barato es Whisper.cpp + Piper corriendo en tu propio PC — gratis y privado — antes de pagar por ElevenLabs.

---

## 5. Túnel para exponer algo desde tu PC (si decides self-hostear cualquier pieza)

| Opción | Costo | Notas |
|---|---|---|
| **Cloudflare Tunnel** | Gratis, sin límite de ancho de banda. [Fuente](https://insights.nomadlab.cc/blog/2026/04/tailscale-vs-cloudflare-tunnel-vs-ngrok-2026) | La opción correcta si self-hosteas algo. Requiere que tu dominio esté en Cloudflare DNS. |
| **ngrok** | Gratis muy limitado (1GB/mes, 1 endpoint, dominio aleatorio en cada reinicio). Personal $8/mes, Pro $20/mes. [Fuente](https://localxpose.io/blog/best-ngrok-alternatives) | Tiene sentido solo para pruebas rápidas, no para algo que quieras dejar corriendo. |
| **Tailscale** | Gratis para uso personal | Red privada entre tus dispositivos — útil si solo quieres acceder al hub desde tu celular/iPad sin exponerlo al público en general. |

**Recomendación:** Si en algún momento self-hosteas algo (el proxy, Jarvis local, etc.), Cloudflare Tunnel sin pensarlo dos veces — es gratis y no tiene los límites molestos de ngrok.

---

## 6. Tarea programada para el resumen semanal

| Opción | Costo | Notas |
|---|---|---|
| **GitHub Actions (repo público)** | Gratis e ilimitado en minutos | Cron con sintaxis POSIX, mínimo cada 5 minutos, corre en UTC (hay que ajustar el horario). Se desactiva solo si el repo está inactivo 60 días. [Fuente](https://www.theanshuman.dev/articles/free-cron-jobs-with-github-actions-31d6) |
| **Vercel Cron** | Incluido en Hobby con límites bajos | Si ya usas Vercel para el proxy, es cómodo, pero comparte el mismo límite de 4h CPU/mes. |
| **Cron en tu PC (`cron`/Task Scheduler)** | $0 | Solo corre si tu PC está encendido a esa hora — poco confiable para algo semanal si tu PC no siempre está prendido. |

**Recomendación:** GitHub Actions. Gratis, no depende de que tu PC esté encendido, y ya vamos a tener el código en un repo de GitHub para el sitio.

---

## 7. Dominio propio (opcional — hoy puedes usar `tuusuario.github.io`)

| Opción | Costo |
|---|---|
| **Cloudflare Registrar** | ~$8/año para `.com`, sin recargos ni markups. [Fuente](https://tldprice.org/registrar/cloudflare) |
| **Quedarte con `github.io`** | Gratis | Suficiente mientras el hub sea solo para ti. |

**Recomendación:** No es necesario ahora. Solo vale la pena si quieres algo más memorable que `tuusuario.github.io`, o si terminas usando Cloudflare Tunnel (ahí sí necesitas un dominio en Cloudflare DNS).

---

## Resumen de la pila recomendada (todo dentro de capas gratuitas para uso personal)

1. **Sitio:** GitHub Pages — gratis.
2. **Proxy (Canvas + Jarvis):** Cloudflare Workers — gratis.
3. **Cerebro de Jarvis:** Claude API (Haiku) — unos pocos dólares al mes, paga por uso real.
4. **Voz:** Web Speech API del navegador para empezar — gratis.
5. **Resumen semanal:** GitHub Actions — gratis.
6. **Dominio:** github.io por ahora — gratis.

Tu PC entra en juego como opción de respaldo/aprendizaje (Ollama, Whisper.cpp, Piper) más que como la base de producción — para un proyecto personal de este tamaño, las capas gratuitas de Cloudflare/GitHub son más confiables que depender de que tu equipo esté siempre encendido.
