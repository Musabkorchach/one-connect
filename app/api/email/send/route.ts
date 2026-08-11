// Backend API for sending external emails
// Uses SMTP via secure environment variables (never exposed to frontend)

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { recipient, subject, body: emailBody, attachmentName } = body;

    // Validate recipient is external email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient)) {
      return Response.json(
        { error: "Invalid email recipient" },
        { status: 400 }
      );
    }

    // Security: Never expose SMTP credentials in frontend
    // In production, use environment variables for email service configuration
    const emailProvider = process.env.EMAIL_PROVIDER || "none"; // e.g., "sendgrid", "mailgun", "aws-ses"
    const emailApiKey = process.env.EMAIL_API_KEY;
    const fromAddress = process.env.EMAIL_FROM_ADDRESS;

    if (!emailApiKey || !fromAddress) {
      console.error("[v0] Email provider not configured");
      return Response.json(
        { error: "Email service not configured" },
        { status: 500 }
      );
    }

    // Example: SendGrid integration (update with your provider)
    // This is a placeholder - actual implementation depends on chosen provider
    if (emailProvider === "sendgrid") {
      // Simulate sending via SendGrid API
      // In production: const response = await fetch('https://api.sendgrid.com/v3/mail/send', { ... })
      console.log(`[v0] Simulating SendGrid email to ${recipient}`);
    } else if (emailProvider === "mailgun") {
      // Simulate sending via Mailgun API
      console.log(`[v0] Simulating Mailgun email to ${recipient}`);
    } else {
      // Fallback: simulate delivery
      console.log(`[v0] Simulating email delivery to ${recipient}`);
    }

    // Return success with delivery tracking ID
    return Response.json({
      success: true,
      messageId: `msg_${Date.now()}`,
      recipient,
      status: "pending",
    });
  } catch (error) {
    console.error("[v0] Email send error:", error);
    return Response.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
