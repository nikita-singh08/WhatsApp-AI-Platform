export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

export class NotificationDispatcher {
  /**
   * Mock email dispatcher printing links and messages to console in development
   */
  static async sendEmail(params: SendEmailParams): Promise<void> {
    const { to, subject, body } = params;
    console.log('\n--- [MOCK EMAIL DISPATCHER] ---');
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log('Body:');
    console.log(body);
    console.log('-------------------------------\n');
    return Promise.resolve();
  }
}
