import axios from 'axios';
import { MessageType } from '@whatsai/shared';

const META_GRAPH_VERSION = 'v19.0';

export interface SendMessageParams {
  phoneNumberId: string;
  accessToken: string;
  recipientWaId: string;
  messageType: MessageType;
  textBody?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: any[];
  interactive?: any;
}

export interface SendMessageResult {
  whatsappMessageId: string;
  rawPayload: any;
}

export interface WhatsappAccountInfo {
  id: string;
  name: string;
  verifiedName: string;
  displayPhoneNumber: string;
  qualityRating: string;
}

/**
 * Client for interacting with the Meta WhatsApp Business Cloud API
 */
export class WhatsappClient {
  /**
   * Send a message to a customer via the Meta Cloud API
   */
  static async sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const {
      phoneNumberId,
      accessToken,
      recipientWaId,
      messageType,
      textBody,
      templateName,
      templateLanguage,
      templateComponents,
      interactive,
    } = params;

    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}/messages`;
    
    let data: any = {
      messaging_product: 'whatsapp',
      to: recipientWaId,
    };

    if (messageType === 'text' && textBody) {
      data = {
        ...data,
        type: 'text',
        text: { body: textBody },
      };
    } else if (messageType === 'template' && templateName) {
      data = {
        ...data,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage || 'en' },
          components: templateComponents || [],
        },
      };
    } else if (messageType === 'interactive' && interactive) {
      data = {
        ...data,
        type: 'interactive',
        interactive,
      };
    } else {
      throw new Error(`Unsupported or incomplete message type: ${messageType}`);
    }

    try {
      const response = await axios.post(url, data, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const messageId = response.data?.messages?.[0]?.id;
      if (!messageId) {
        throw new Error('Meta API did not return a message ID');
      }

      return {
        whatsappMessageId: messageId,
        rawPayload: response.data,
      };
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const errorMessage = errorData
        ? `[Meta API Error] ${errorData.message} (code: ${errorData.code}, subcode: ${errorData.error_subcode})`
        : error.message;
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate a system token and retrieve account info for manual setup validation
   */
  static async getAccountDetails(
    phoneNumberId: string,
    accessToken: string
  ): Promise<WhatsappAccountInfo> {
    const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${phoneNumberId}`;

    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.data;
      return {
        id: data.id,
        name: data.verified_name || data.display_phone_number || 'Unnamed Account',
        verifiedName: data.verified_name || '',
        displayPhoneNumber: data.display_phone_number || '',
        qualityRating: data.quality_rating || 'unknown',
      };
    } catch (error: any) {
      const errorData = error.response?.data?.error;
      const errorMessage = errorData
        ? `[Meta API Error] ${errorData.message} (code: ${errorData.code})`
        : error.message;
      throw new Error(errorMessage);
    }
  }
}
