# Encryption Flow

1. **Registration / Key Generation**
   - User signs up.
   - Client generates ECDSA/RSA Key Pair.
   - Public Key is sent to server.
   - Private Key is stored securely on device (never transmitted).

2. **Sending a Message**
   - **Alice** wants to msg **Bob**.
   - Client fetches **Bob's Public Key** from server.
   - Client encrypts message: `Cipher = Encrypt(Message, Bob_PublicKey)`
   - Cipher is sent to server via REST or WebSocket.

3. **Receiving a Message**
   - Server pushes `Cipher` to **Bob**.
   - **Bob's Client** uses stored **Private Key**.
   - Decrypts: `Message = Decrypt(Cipher, Bob_PrivateKey)`.

4. **Security Guarantees**
   - Server cannot read messages (confidentiality).
   - Only holder of Private Key can read messages.
   - HMAC/Signature can be added for integrity (future scope).
