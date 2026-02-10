

from alembic import op
import sqlalchemy as sa

revision = 'add_profiles_privacy_001'
down_revision = 'add_notifications_001'
branch_labels = None
depends_on = None

visibility_enum = sa.Enum('everyone', 'friends', 'nobody', name='visibilitylevel')


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
    bind = op.get_bind()
    insp = sa.inspect(bind)
    existing_tables = insp.get_table_names()

    if 'visibilitylevel' not in [e.name for e in insp.get_enums()]:
        visibility_enum.create(bind, checkfirst=True)

    if 'user_profiles' not in existing_tables:
        op.create_table(
            'user_profiles',
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
            sa.Column('display_name', sa.String(length=100), nullable=True),
            sa.Column('bio', sa.Text(), nullable=True),
            sa.Column('birthday', sa.Date(), nullable=True),
            sa.Column('location_city', sa.String(length=120), nullable=True),
            sa.Column('website', sa.String(length=255), nullable=True),
            sa.Column('social_links', sa.JSON(), nullable=True),
            sa.Column('status_message', sa.String(length=160), nullable=True),
            sa.Column('pronouns', sa.String(length=32), nullable=True),
            sa.Column('emoji_badge', sa.String(length=16), nullable=True),
            sa.Column('theme', sa.JSON(), nullable=True),
            sa.Column('banner_url', sa.String(length=512), nullable=True),
            sa.Column('avatar_url', sa.String(length=512), nullable=True),
            sa.Column('avatar_blur', sa.String(length=64), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        _create_update_timestamp_trigger('user_profiles')

    if 'privacy_settings' not in existing_tables:
        op.create_table(
            'privacy_settings',
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
            sa.Column('profile_visibility', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('avatar_visibility', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('field_visibility', sa.JSON(), nullable=True),
            sa.Column('last_seen_visibility', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('online_visibility', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('typing_visibility', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('read_receipts_visibility', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('discovery_opt_in', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('message_request_policy', visibility_enum, nullable=False, server_default='friends'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
        )
        _create_update_timestamp_trigger('privacy_settings')

def downgrade():
    _drop_update_timestamp_trigger('privacy_settings')
    _drop_update_timestamp_trigger('user_profiles')
    op.drop_table('privacy_settings')
    op.drop_table('user_profiles')
    visibility_enum.drop(op.get_bind(), checkfirst=True)
