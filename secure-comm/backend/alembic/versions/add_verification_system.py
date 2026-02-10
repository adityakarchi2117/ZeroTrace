

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# Alembic revision metadata
revision = 'add_verification_system_001'
down_revision = 'add_profiles_privacy_001'
branch_labels = None
depends_on = None


def _create_update_timestamp_trigger(table_name: str):
    """Create a PostgreSQL trigger to auto-update updated_at on row modification."""
    func_name = f"update_{table_name}_updated_at"
    op.execute(f"""
        CREATE OR REPLACE FUNCTION {func_name}()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute(f"""
        CREATE TRIGGER trg_{table_name}_updated_at
        BEFORE UPDATE ON {table_name}
        FOR EACH ROW
        EXECUTE FUNCTION {func_name}();
    """)


def _drop_update_timestamp_trigger(table_name: str):
    """Drop the auto-update trigger and function for a table."""
    func_name = f"update_{table_name}_updated_at"
    op.execute(f"DROP TRIGGER IF EXISTS trg_{table_name}_updated_at ON {table_name}")
    op.execute(f"DROP FUNCTION IF EXISTS {func_name}()")


def upgrade():
    op.execute("""
        CREATE TYPE verification_type AS ENUM (
            'identity',
            'email', 
            'phone',
            'organization',
            'custom'
        )
    """)

    op.execute("""
        CREATE TYPE verification_status AS ENUM (
            'pending',
            'approved',
            'rejected',
            'expired'
        )
    """)

    op.create_table(
        'verification_badges',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('verification_type', sa.Enum('identity', 'email', 'phone', 'organization', 'custom', name='verification_type', create_type=False), nullable=False),
        sa.Column('badge_label', sa.String(100), nullable=True),
        sa.Column('badge_color', sa.String(20), nullable=True),
        sa.Column('verified_at', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('verified_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('verification_data', JSON, nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        'verification_requests',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('verification_type', sa.Enum('identity', 'email', 'phone', 'organization', 'custom', name='verification_type', create_type=False), nullable=False),
        sa.Column('status', sa.Enum('pending', 'approved', 'rejected', 'expired', name='verification_status', create_type=False), server_default=sa.text("'pending'")),
        sa.Column('requested_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('rejection_reason', sa.Text(), nullable=True),
        sa.Column('supporting_documents', JSON, nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
    )
    _create_update_timestamp_trigger('verification_requests')

    op.create_table(
        'verification_history',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('verification_type', sa.Enum('identity', 'email', 'phone', 'organization', 'custom', name='verification_type', create_type=False), nullable=False),
        sa.Column('action', sa.String(50), nullable=False),
        sa.Column('performed_by', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('meta', JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_index('ix_verification_badges_user_id', 'verification_badges', ['user_id'])
    op.create_index('ix_verification_badges_type', 'verification_badges', ['verification_type'])
    op.create_index('ix_verification_requests_user_id', 'verification_requests', ['user_id'])
    op.create_index('ix_verification_requests_status', 'verification_requests', ['status'])
    op.create_index('ix_verification_history_user_id', 'verification_history', ['user_id'])

    op.add_column('users', sa.Column('is_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False))
    op.add_column('users', sa.Column('verification_level', sa.Integer(), server_default=sa.text('0'), nullable=False))

def downgrade():
    op.drop_column('users', 'verification_level')
    op.drop_column('users', 'is_verified')

    op.drop_index('ix_verification_history_user_id')
    op.drop_index('ix_verification_requests_status')
    op.drop_index('ix_verification_requests_user_id')
    op.drop_index('ix_verification_badges_type')
    op.drop_index('ix_verification_badges_user_id')

    _drop_update_timestamp_trigger('verification_requests')

    op.drop_table('verification_history')
    op.drop_table('verification_requests')
    op.drop_table('verification_badges')

    op.execute("DROP TYPE verification_status")
    op.execute("DROP TYPE verification_type")
