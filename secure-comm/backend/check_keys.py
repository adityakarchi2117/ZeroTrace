from app.db.database import SessionLocal, User
db = SessionLocal()
try:
    users = db.query(User).filter(User.username.in_(['likhita', 'chinni'])).all()
    print("Detailed Key Status:")
    for u in users:
        print(f"User: {u.username}")
        print(f"  public_key: {u.public_key[:10] if u.public_key else 'None'}...")
        print(f"  identity_key: {u.identity_key[:10] if u.identity_key else 'None'}...")
        print(f"  signed_prekey: {u.signed_prekey[:10] if u.signed_prekey else 'None'}...")
        print(f"  signature: {u.signed_prekey_signature[:10] if u.signed_prekey_signature else 'None'}...")
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
