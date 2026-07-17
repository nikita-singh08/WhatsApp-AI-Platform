import { encrypt, decrypt, verifyMetaSignature } from '@whatsai/integrations';

describe('Crypto Utilities', () => {
  const secretKey = '73e8e19c3fb45df5a3c20023ee45c43d9b1525a77b7e5623cf51d8b13c8f8b91';

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = secretKey;
  });

  it('should encrypt and decrypt a string successfully', () => {
    const plainText = 'E2E-WhatsApp-Access-Token-12345';
    const encrypted = encrypt(plainText);
    
    expect(encrypted).toContain(':');
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plainText);
  });

  it('should throw an error for malformed encrypted data during decryption', () => {
    expect(() => decrypt('malformed')).toThrow();
    expect(() => decrypt('invalid:parts')).toThrow();
  });

  it('should verify a valid Meta signature', () => {
    const rawBody = '{"object":"whatsapp_business_account","entry":[]}';
    const appSecret = 'my_facebook_app_secret';
    
    // Compute valid signature
    const crypto = require('crypto');
    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    const signatureHeader = `sha256=${expectedHash}`;

    const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);
    expect(isValid).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const isValid = verifyMetaSignature(
      'rawbody',
      'sha256=wronghash',
      'secret'
    );
    expect(isValid).toBe(false);
  });
});
