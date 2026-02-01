"""Add notifications and rejection_log tables

Revision ID: add_notifications_001
Revises: fix_friend_requests_001
Create Date: 2026-02-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = 'add_notifications_001'
down_revision = 'fix_friend_requests_001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add notifications and rejection_log tables."""
    
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Create notifications table
    if 'notifications' not in existing_tables:
        op.create_table(
            'notifications',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True),
            sa.Column('notification_type', sa.String(50), nullable=False),
            sa.Column('title', sa.String(255), nullable=False),
            sa.Column('message', sa.Text(), nullable=False),
            sa.Column('payload', sa.Text(), nullable=True),  # JSON string for extra data
            sa.Column('related_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
            sa.Column('is_read', sa.Boolean(), default=False, nullable=False),
            sa.Column('is_delivered', sa.Boolean(), default=False, nullable=False),
            sa.Column('created_at', sa.DateTime(), default=sa.func.now(), nullable=False),
            sa.Column('read_at', sa.DateTime(), nullable=True),
            sa.Column('expires_at', sa.DateTime(), nullable=True),
        )
        
        # Create indexes for notifications
        op.create_index('ix_notifications_user_id', 'notifications', ['user_id'])
        op.create_index('ix_notifications_user_unread', 'notifications', ['user_id', 'is_read'])
        op.create_index('ix_notifications_type', 'notifications', ['notification_type'])
        op.create_index('ix_notifications_created_at', 'notifications', ['created_at'])
        op.create_index('ix_notifications_expires_at', 'notifications', ['expires_at'])
        op.create_index('ix_notifications_delivery', 'notifications', ['user_id', 'is_delivered'])
        
        print("Created notifications table with indexes")
    else:
        print("notifications table already exists")
    
    # Create rejection_log table (for anti-spam tracking)
    if 'rejection_log' not in existing_tables:
        op.create_table(
            'rejection_log',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('rejection_hash', sa.String(64), nullable=False, unique=True),  # SHA-256 hash of user pair
            sa.Column('rejection_count', sa.Integer(), default=1, nullable=False),
            sa.Column('first_rejection_at', sa.DateTime(), default=sa.func.now(), nullable=False),
            sa.Column('last_rejection_at', sa.DateTime(), default=sa.func.now(), nullable=False),
        )
        
        # Create indexes for rejection_log
        op.create_index('ix_rejection_log_hash', 'rejection_log', ['rejection_hash'], unique=True)
        op.create_index('ix_rejection_log_last_rejection', 'rejection_log', ['last_rejection_at'])
        
        print("Created rejection_log table with indexes")
    else:
        print("rejection_log table already exists")


def downgrade() -> None:
    """Remove notifications and rejection_log tables."""
    
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    existing_tables = inspector.get_table_names()
    
    # Drop rejection_log table and its indexes
    if 'rejection_log' in existing_tables:
        op.drop_index('ix_rejection_log_last_rejection', table_name='rejection_log')
        op.drop_index('ix_rejection_log_hash', table_name='rejection_log')
        op.drop_table('rejection_log')
        print("Dropped rejection_log table")
    
    # Drop notifications table and its indexes
    if 'notifications' in existing_tables:
        op.drop_index('ix_notifications_delivery', table_name='notifications')
        op.drop_index('ix_notifications_expires_at', table_name='notifications')
        op.drop_index('ix_notifications_created_at', table_name='notifications')
        op.drop_index('ix_notifications_type', table_name='notifications')
        op.drop_index('ix_notifications_user_unread', table_name='notifications')
        op.drop_index('ix_notifications_user_id', table_name='notifications')
        op.drop_table('notifications')
        print("Dropped notifications table")
