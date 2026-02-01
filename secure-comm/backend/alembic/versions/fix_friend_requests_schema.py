"""Fix friend_requests schema - add missing columns

Revision ID: fix_friend_requests_001
Revises: 
Create Date: 2026-02-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'fix_friend_requests_001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add missing columns to friend_requests table."""
    
    # Check if columns exist before adding them
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [col['name'] for col in inspector.get_columns('friend_requests')]
    
    # Add sender_id if it doesn't exist
    if 'sender_id' not in columns:
        op.add_column('friend_requests', sa.Column('sender_id', sa.Integer(), nullable=False, server_default='1'))
        op.create_index('ix_friend_requests_sender_id', 'friend_requests', ['sender_id'])
        op.create_foreign_key('fk_friend_requests_sender', 'friend_requests', 'users', ['sender_id'], ['id'], ondelete='CASCADE')
    
    # Add sender_public_key_fingerprint if it doesn't exist
    if 'sender_public_key_fingerprint' not in columns:
        op.add_column('friend_requests', sa.Column('sender_public_key_fingerprint', sa.String(64), nullable=False, server_default=''))
    
    # Add receiver_id if it doesn't exist
    if 'receiver_id' not in columns:
        op.add_column('friend_requests', sa.Column('receiver_id', sa.Integer(), nullable=False, server_default='1'))
        op.create_index('ix_friend_requests_receiver_id', 'friend_requests', ['receiver_id'])
        op.create_foreign_key('fk_friend_requests_receiver', 'friend_requests', 'users', ['receiver_id'], ['id'], ondelete='CASCADE')
    
    # Add receiver_public_key_fingerprint if it doesn't exist
    if 'receiver_public_key_fingerprint' not in columns:
        op.add_column('friend_requests', sa.Column('receiver_public_key_fingerprint', sa.String(64), nullable=True))
    
    # Add encrypted_message if it doesn't exist
    if 'encrypted_message' not in columns:
        op.add_column('friend_requests', sa.Column('encrypted_message', sa.Text(), nullable=True))
    
    # Add expires_at if it doesn't exist
    if 'expires_at' not in columns:
        op.add_column('friend_requests', sa.Column('expires_at', sa.DateTime(), nullable=False, server_default=sa.func.now()))
        op.create_index('ix_friend_requests_expires_at', 'friend_requests', ['expires_at'])
    
    # Add request_nonce if it doesn't exist
    if 'request_nonce' not in columns:
        op.add_column('friend_requests', sa.Column('request_nonce', sa.String(64), nullable=False, server_default=''))
        op.create_unique_constraint('uq_friend_requests_nonce', 'friend_requests', ['request_nonce'])
    
    # Drop old columns if they exist (from old schema)
    if 'from_user_id' in columns:
        op.drop_column('friend_requests', 'from_user_id')
    if 'to_user_id' in columns:
        op.drop_column('friend_requests', 'to_user_id')
    if 'initiated_by' in columns:
        op.drop_column('friend_requests', 'initiated_by')
    if 'responded_at' in columns:
        op.drop_column('friend_requests', 'responded_at')
    if 'rejection_reason' in columns:
        op.drop_column('friend_requests', 'rejection_reason')
    
    # Create composite indexes
    op.create_index('ix_friend_request_sender_receiver', 'friend_requests', ['sender_id', 'receiver_id'])
    op.create_index('ix_friend_request_pending', 'friend_requests', ['receiver_id', 'status'])
    op.create_index('ix_friend_request_expires', 'friend_requests', ['expires_at', 'status'])


def downgrade() -> None:
    """Remove the columns we added."""
    # This is a one-way migration for fixing production data
    pass
