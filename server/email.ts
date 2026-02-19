import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { getSecrets } from "./vault";
import { logger } from "./logger";

let sesClient: SESClient | null = null;
let senderEmail = "noreply@goyoyd.com";
let initialized = false;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  const secrets = await getSecrets([
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "SES_SENDER_EMAIL",
  ]);
  const region = secrets.AWS_REGION || "us-east-1";
  sesClient = new SESClient({
    region,
    credentials: {
      accessKeyId: secrets.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: secrets.AWS_SECRET_ACCESS_KEY || "",
    },
  });
  if (secrets.SES_SENDER_EMAIL) {
    senderEmail = secrets.SES_SENDER_EMAIL;
  }
  initialized = true;
  logger.email.info("SES email client initialized", { region, sender: senderEmail });
}

export async function sendShareEmail(
  recipientEmail: string,
  shareLink: string,
  fileName: string,
  ownerName: string
): Promise<boolean> {
  try {
    await ensureInitialized();
    if (!sesClient) {
      logger.email.warn("SES client not available, skipping email");
      return false;
    }

    const subject = `${ownerName} shared a file with you on goyoyd`;
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 24px; font-weight: bold; color: #111;">goyoyd</h1>
          <p style="color: #666; font-size: 14px;">You Own It. We Just Help You See It.</p>
        </div>
        <div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px 0; color: #333; font-size: 16px;">
            <strong>${ownerName}</strong> shared a file with you:
          </p>
          <p style="margin: 0 0 20px 0; color: #111; font-size: 18px; font-weight: 600;">
            ${fileName}
          </p>
          <a href="${shareLink}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 14px;">
            Download File
          </a>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center;">
          This link expires in 7 days. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `;
    const textBody = `${ownerName} shared a file with you on goyoyd: ${fileName}\n\nDownload it here: ${shareLink}\n\nThis link expires in 7 days.`;

    const command = new SendEmailCommand({
      Source: senderEmail,
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: {
          Html: { Data: htmlBody, Charset: "UTF-8" },
          Text: { Data: textBody, Charset: "UTF-8" },
        },
      },
    });

    await sesClient.send(command);
    logger.email.info("Share email sent", { to: recipientEmail, file: fileName });
    return true;
  } catch (err: any) {
    logger.email.error("Failed to send share email", err, { to: recipientEmail, file: fileName });
    return false;
  }
}
