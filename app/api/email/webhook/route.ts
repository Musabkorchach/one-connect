// Backend webhook for receiving incoming external emails
// Receives webhook payloads from email providers (SendGrid, Mailgun, etc.)
// Never expose credentials; all validation done server-side

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate webhook signature (provider-specific)
    const provider = process.env.EMAIL_PROVIDER || "none";
    const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.warn("[v0] Webhook secret not configured");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // TODO: Implement signature verification based on provider
    // SendGrid: verify X-Twilio-Email-Event-Webhook-Signature header
    // Mailgun: verify signature in body
    // AWS SES: verify SNS subscription confirmation

    // Extract email data based on provider
    let fromEmail = "";
    let toEmail = "";
    let subject = "";
    let emailBody = "";
    let eventType = "delivered";

    if (provider === "sendgrid") {
      // Handle SendGrid webhook format
      const events = Array.isArray(body) ? body : [body];
      for (const event of events) {
        fromEmail = event.from?.email || "";
        toEmail = event.to?.email || "";
        subject = event.subject || "";
        emailBody = event.text || event.html || "";
        eventType = event.event || "delivered"; // bounce, dropped, delivered, etc.
      }
    } else if (provider === "mailgun") {
      // Handle Mailgun webhook format
      fromEmail = body["from"] || "";
      toEmail = body["recipient"] || "";
      subject = body["subject"] || "";
      emailBody = body["body-plain"] || body["body-html"] || "";
      eventType = body["event"] || "delivered";
    }

    console.log(`[v0] Webhook: ${eventType} email from ${fromEmail} to ${toEmail}`);

    // In production, update email status in database/user state
    // For now, just acknowledge receipt
    return Response.json({ success: true, status: eventType });
  } catch (error) {
    console.error("[v0] Webhook error:", error);
    return Response.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}
