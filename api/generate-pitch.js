import OpenAI from "openai"

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export const config = {
  runtime: "edge",
}

export default async function handler(req) {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    })
  }

  try {
    const body = await req.json()

    const {
      isCustomForm,
      userName,
      intent,
      signals,
      persona,
      trials,
      lastActive,
      searchHistory,
      classesBrowsed,
      centresViewed,
      preferredTiming,
      budgetSensitivity,
      additionalNotes,
      referralSource,
      formName,
      formGoal,
      formActivities,
      formTiming,
      formBudget,
      formExperience,
      formObjection,
      planDuration,
      planPrice,
      planMonthlyPrice,
      planBenefits,
      planSavings,
      planAccessType,
      centreName,
    } = body

    const userPrompt = isCustomForm
      ? buildCustomFormPrompt({
          formName,
          formGoal,
          formActivities,
          formTiming,
          formBudget,
          formExperience,
          formObjection,
          planDuration,
          planPrice,
          planMonthlyPrice,
          planBenefits,
          planSavings,
          planAccessType,
          centreName,
        })
      : buildBehavioralPrompt({
          userName,
          intent,
          signals,
          persona,
          trials,
          lastActive,
          searchHistory,
          classesBrowsed,
          centresViewed,
          preferredTiming,
          budgetSensitivity,
          additionalNotes,
          referralSource,
          planDuration,
          planPrice,
          planMonthlyPrice,
          planBenefits,
          planSavings,
          planAccessType,
          centreName,
        })

    const stream = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert gym sales manager at Cult.fit, India's premium fitness chain. You write personalized, warm, and compelling membership pitches for centre managers to deliver in person.

Your pitches must be:
- Conversational and natural sounding (not robotic or salesy)
- Exactly 3-5 sentences
- Highly specific to the customer's actual behavior and data
- Focused on value, not just price
- Include one subtle urgency element
- Written as the manager speaking directly to the customer
- Start with something specific the customer did (trial, search, visit)
- Never start with "I" or "Welcome to Cult.fit"
- End with a soft close or next step

Tone: Warm, confident, knowledgeable. Like a trusted fitness advisor.`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      stream: true,
      max_tokens: 250,
      temperature: 0.75,
    })

    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || ""
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`)
              )
            }
            if (chunk.choices[0]?.finish_reason === "stop") {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            }
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  }
}

function buildBehavioralPrompt(data) {
  return `
Generate a personalized sales pitch using this customer's real behavioral data:

CUSTOMER:
- Name: ${data.userName || "Customer"}
- Intent Level: ${data.intent || "Unknown"}
- Persona Type: ${data.persona || "general"}
- Trials Taken: ${data.trials || "None"}
- Last Active: ${data.lastActive || "Recently"}
- Preferred Timing: ${data.preferredTiming || "Flexible"}
- Budget Sensitivity: ${data.budgetSensitivity || "MEDIUM"}
- Referral Source: ${data.referralSource || "Unknown"}

BEHAVIORAL SIGNALS:
- Intent Signals: ${data.signals?.join(", ") || "None"}
- Search History: ${data.searchHistory?.join(", ") || "None"}
- Classes Browsed: ${data.classesBrowsed?.join(", ") || "None"}
- Centres Viewed: ${data.centresViewed?.join(", ") || "None"}
- Manager Notes: ${data.additionalNotes || "None"}

RECOMMENDED PLAN:
- Plan: ${data.planDuration} ${data.planAccessType}
- Total Price: ${data.planPrice}
- Monthly Cost: ${data.planMonthlyPrice}
- Key Benefits: ${data.planBenefits?.join(", ") || "Full access"}
${data.planSavings ? `- Savings: ${data.planSavings}` : ""}

Centre: ${data.centreName || "Cult.fit"}

Write a 3-5 sentence personalized pitch the centre manager should say out loud to ${data.userName}. Reference specific things they browsed or tried. Make it feel like you know them personally.
  `.trim()
}

function buildCustomFormPrompt(data) {
  return `
Generate a personalized sales pitch for a new walk-in customer:

CUSTOMER DETAILS:
- Name: ${data.formName || "Customer"}
- Fitness Goal: ${data.formGoal || "General Fitness"}
- Interested Activities: ${data.formActivities?.join(", ") || "Gym"}
- Preferred Workout Time: ${data.formTiming || "Flexible"}
- Budget Range: ${data.formBudget || "Mid Range"}
- Experience Level: ${data.formExperience || "Beginner"}
- Main Objection: ${data.formObjection || "None"}

RECOMMENDED PLAN:
- Plan: ${data.planDuration} ${data.planAccessType}
- Total Price: ${data.planPrice}
- Monthly Cost: ${data.planMonthlyPrice}
- Key Benefits: ${data.planBenefits?.join(", ") || "Full access"}
${data.planSavings ? `- Savings: ${data.planSavings}` : ""}

Centre: ${data.centreName || "Cult.fit"}

Write a 3-5 sentence pitch the manager should say to ${data.formName}. Naturally address their "${data.formObjection}" objection. Connect specifically to their "${data.formGoal}" goal. Reference their preferred activities.
  `.trim()
}
