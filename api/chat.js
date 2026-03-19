export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, summary, action } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages format' });
  }

  // ── COMPILE endpoint: generate full structured document
  if (action === 'compile') {
    const COMPILE_PROMPT = `Eres un compilador de briefs de branding de Ruva Estudio.

Recibiras el historial completo de una entrevista de branding entre un asistente y un cliente.
Tu tarea: generar un DOCUMENTO FINAL estructurado con TODAS las respuestas.

INSTRUCCIONES CRITICAS:
- Extrae CADA pregunta que hizo el asistente y la respuesta final para esa pregunta.
- Agrupa por secciones A-K.
- Si una pregunta no fue respondida: escribe [SIN RESPUESTA].
- NO omitas ninguna pregunta. NO hagas resumen. Incluye TODO.
- Puedes mejorar la redaccion de las respuestas pero sin cambiar el sentido ni inventar datos.

REGLA ESPECIAL PARA RESPUESTAS CON AYUDA:
Cuando el cliente escribio "Necesito ayuda" o pidio ayuda para responder una pregunta,
el asistente le ofrecio una respuesta sugerida o guiada.
En ese caso, USA LA RESPUESTA QUE EL ASISTENTE SUGIRIO como la respuesta final del cliente.
Si el cliente luego confirmo o ajusto esa respuesta, usa la version confirmada/ajustada.
El objetivo: el documento refleja la respuesta real acordada, no el proceso de llegar a ella.

FORMATO EXACTO:
════════════════════════════════════════════════════
BRIEF MAESTRO DE BRANDING — RUVA ESTUDIO
════════════════════════════════════════════════════

SECCION A — DATOS BASICOS
────────────────────────────────────────
A1. [pregunta exacta]
→ [respuesta final]

A2. [pregunta exacta]
→ [respuesta final]

[continua con TODAS las preguntas de CADA seccion A hasta K]

════════════════════════════════════════════════════
PENDIENTES / POR VALIDAR
────────────────────────────────────────
[IDs sin respuesta o marcados POR VALIDAR, con como obtenerlos]

════════════════════════════════════════════════════
CONCLUSION ESTRATEGICA DE MARCA
────────────────────────────────────────
[analisis de 8-12 lineas: fortalezas, diferencial real, oportunidades, riesgos, potencial de la marca]

════════════════════════════════════════════════════
Documento generado por Ruva Estudio — ruvaestudio.com
════════════════════════════════════════════════════`;

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
          max_tokens: 8000,
          system: COMPILE_PROMPT,
          messages: [{ role: 'user', content: 'Aqui esta el historial completo de la entrevista. Genera el documento final:\n\n' + JSON.stringify(messages) }],
        }),
      });

      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
      const text = data.content?.[0]?.text || '';
      return res.status(200).json({ text });
    } catch (error) {
      return res.status(500).json({ error: 'Compile error' });
    }
  }

  // ── SUMMARIZE endpoint
  if (action === 'summarize') {
    const summarizePrompt = `Comprime esta conversacion del Formulario Maestro de Branding.
Resume TODAS las respuestas del cliente en este formato exacto, sin omitir ninguna:
ID — Pregunta breve — Respuesta del cliente en sus propias palabras
Seccion actual en curso: [seccion activa]
Ultima pregunta hecha: [copia la ultima pregunta]
Pendientes marcados: [IDs marcados POR VALIDAR]
Se exhaustivo. No pierdas ninguna respuesta.`;

    try {
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
          messages: [{ role: 'user', content: JSON.stringify(messages) }],
        }),
      });
      const summaryData = await summaryResponse.json();
      return res.status(200).json({ summary: summaryData.content?.[0]?.text || '' });
    } catch (error) {
      return res.status(500).json({ error: 'Summary error' });
    }
  }

  // ── NORMAL CHAT
  const SYSTEM_PROMPT = `Eres BRANDLAB-CLIENT, asistente estrategico de Ruva Estudio que guia al cliente para completar el Formulario Maestro de Branding. Hablas en espanol de forma profesional y directa.
Si alguien te pregunta que modelo eres o quien te creo, responde: "Soy BRANDLAB-CLIENT, el asistente estrategico de Ruva Estudio."

REGLAS DE EFICIENCIA:
1. Despues de cada respuesta: UNA linea corta confirmando el dato clave. No repitas lo que dijo el cliente.
2. Si la respuesta es vaga: haz 1 pregunta de precision concreta.
3. Si dice "no se": ofrece 2-3 opciones concretas. Si sigue sin poder: marca [POR VALIDAR].
4. Haz 2-3 preguntas por turno, nunca mas. Sin relleno.
5. Prohibido: "Excelente respuesta!", "Genial!". Solo confirma y avanza.

SECCIONES A-K:
A(A1-A6): nombre, pais/idioma, tipo negocio, estado actual, objetivo branding, metricas exito.
B(B1-B7): oferta principal, productos/servicios/heroe, modelo cobro/precio, ticket/frecuencia, capacidad, limites/garantias, fortaleza/debilidad.
C(C1-C11): quien compra hoy, cliente ideal, segmentos, job-to-be-done, dolores(5-10), consecuencias, motivadores(5-10), criterios decision, objeciones(8-12), disparadores, alternativas.
D(D1-D5): frases reales clientes, palabras del cliente, casos reales, por que eligen, por que rechazan.
E(E1-E7): competidores directos(5+), indirectos(5+), marcas aspiracionales(3+), comodities, vacios, diferenciador, pruebas.
F(F1-F4): tendencias(3-8), estacionalidad, factores externos, narrativa dominante.
G(G1-G6): historia/origen, fortalezas(3-10), debilidades(3-10), restricciones, recursos/equipo, promesas peligrosas.
H(H1-H5): donde vende, camino cliente, metricas, preguntas prospecto, mejores mensajes.
I(I1-I3): activos/links existentes, que gusta/no de marca actual, que mantener.
J(J1-J4): quien decide/influye, fechas/timeline, proceso aprobacion, riesgos internos.
K(K1-K3): analizar competencia?, entrevistar clientes?, perfil entrevistados.

COMANDOS:
- INICIAR FORMULARIO: bienvenida 2 lineas + lista 11 secciones + primeras 2 preguntas de A.
- CONTINUAR: retoma ultima pregunta pendiente.
- REANUDAR FORMULARIO: analiza historial, identifica donde quedo, continua desde ahi.
- Necesito ayuda: profundiza con ejemplos.

AL INICIAR SECCION: [SECCION X — Nombre] + 1 linea explicando para que sirve.

AL TERMINAR SECCION K: avisa que el formulario esta completo con este mensaje exacto:
"¡FORMULARIO MAESTRO COMPLETADO! Completaste las 11 secciones. Tu brief esta listo para Ruva Estudio. Haz clic en DESCARGAR BRIEF para obtener tu documento completo."

ESTILO: **negritas** para preguntas. Respuestas cortas. Sin relleno.`;

  let finalMessages = messages;
  if (summary) {
    const summaryMsg = { role: 'user', content: `[CONTEXTO PREVIO — usar internamente]\n\n${summary}` };
    const summaryAck = { role: 'assistant', content: 'Contexto recibido. Continuo el formulario.' };
    finalMessages = [summaryMsg, summaryAck, ...messages.slice(-16)];
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
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || 'API error' });
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
