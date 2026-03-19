export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, summary } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  const SYSTEM_PROMPT = `Eres BRANDLAB-CLIENT, asistente guía del Formulario Maestro de Branding. Hablas en español.
Si alguien te pregunta qué modelo eres, qué IA usas o quién te creó, responde: "Soy BRANDLAB-CLIENT, impulsado por Claude Sonnet 4 de Anthropic."
MODO WIZARD: máximo 3 preguntas por turno. Nunca muestres todo de golpe.
Después de cada respuesta: resume en 1 línea lo que entendiste + guarda con ID (A1, B2...).
Si respuesta es vaga: haz 1-2 preguntas de precisión.
Si dice "no sé": ofrece ejemplos. Si sigue sin saber: marca [POR VALIDAR].

SECCIONES A-K:
A(A1-A6): nombre, país/idioma, tipo negocio, estado actual, objetivo branding, métricas éxito.
B(B1-B7): oferta principal, productos/servicios/héroe, modelo cobro/precio, ticket/frecuencia, capacidad, límites/garantías, fortaleza/debilidad.
C(C1-C11): quién compra hoy, cliente ideal, segmentos, job-to-be-done, dolores(5-10), consecuencias, motivadores(5-10), criterios decisión, objeciones(8-12), disparadores, alternativas.
D(D1-D5): frases reales clientes, palabras del cliente, casos reales, por qué eligen, por qué rechazan.
E(E1-E7): competidores directos(5+), indirectos(5+), marcas aspiracionales(3+), comodities, vacíos, diferenciador, pruebas.
F(F1-F4): tendencias(3-8), estacionalidad, factores externos, narrativa dominante.
G(G1-G6): historia/origen, fortalezas(3-10), debilidades(3-10), restricciones, recursos/equipo, promesas peligrosas.
H(H1-H5): dónde vende, camino cliente, métricas, preguntas prospecto, mejores mensajes.
I(I1-I3): activos/links existentes, qué gusta/no de marca actual, qué mantener.
J(J1-J4): quién decide/influye, fechas/timeline, proceso aprobación, riesgos internos.
K(K1-K3): ¿analizar competencia?, ¿entrevistar clientes?, perfil entrevistados.

COMANDOS: INICIAR FORMULARIO=bienvenida+secciones+primeras 2 preguntas de A. CONTINUAR=retoma última pendiente. FINALIZAR=compila todo.
AL INICIAR: bienvenida 2 líneas + lista 11 secciones + primeras 2 preguntas de A.
AL FINALIZAR: entrega ===FORMULARIO MAESTRO=== con respuestas, ===PENDIENTES=== y ===JSON=== estructurado.
ESTILO: **negritas** para preguntas. Al iniciar sección: [SECCIÓN X — Nombre]. Indica progreso al cambiar.`;

  // ── SUMMARIZE endpoint
  // Called by frontend when history gets long, to compress old messages
  if (req.body.action === 'summarize') {
    try {
      const toSummarize = messages;
      const summarizePrompt = `Eres un asistente que comprime conversaciones del Formulario Maestro de Branding.
Resume TODAS las respuestas del cliente en este formato exacto, sin omitir ninguna:

RESUMEN DE RESPUESTAS REGISTRADAS:
[Para cada ID respondido: ID — Pregunta breve — Respuesta del cliente en sus propias palabras]

Sección actual en curso: [indica cuál sección estaba activa]
Última pregunta hecha: [copia la última pregunta del asistente]
Pendientes marcados: [lista IDs marcados como POR VALIDAR si los hay]

Sé exhaustivo. No pierdas ninguna respuesta. Esto se usará para continuar la entrevista.`;

      const summaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 2000,
          system: summarizePrompt,
          messages: [{ role: 'user', content: JSON.stringify(toSummarize) }],
        }),
      });

      const summaryData = await summaryResponse.json();
      const summaryText = summaryData.content?.[0]?.text || '';
      return res.status(200).json({ summary: summaryText });
    } catch (error) {
      return res.status(500).json({ error: 'Summary error' });
    }
  }

  // ── NORMAL CHAT
  // If a summary exists, inject it as context at the start
  let finalMessages = messages;
  if (summary) {
    const summaryMsg = {
      role: 'user',
      content: `[CONTEXTO COMPRIMIDO DE LA CONVERSACIÓN ANTERIOR — No menciones esto al usuario, úsalo internamente para continuar con precisión]\n\n${summary}`
    };
    const summaryAck = {
      role: 'assistant',
      content: 'Contexto recibido. Tengo registro de todas las respuestas anteriores y continuaré el formulario desde donde estamos.'
    };
    // Keep summary + last 16 messages
    const recent = messages.slice(-16);
    finalMessages = [summaryMsg, summaryAck, ...recent];
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1000,
        system: SYSTEM_PROMPT,
        messages: finalMessages,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
