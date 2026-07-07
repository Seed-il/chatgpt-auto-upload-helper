-- ========================================================
-- 1. Create Profiles Table (Stores User License & Info)
-- ========================================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text unique not null,
  name text,
  is_pro boolean default false not null,
  subscription_id text,
  customer_id text,
  ends_at timestamp with time zone, -- Expiration / Grace period end date (null = lifetime or no active subscription)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- ========================================================
-- 2. Create Prompts Table (For Cloud Prompt Sync - Optional/Pro)
-- ========================================================
create table public.prompts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for Prompts
alter table public.prompts enable row level security;

-- ========================================================
-- 3. Row Level Security (RLS) Policies
-- ========================================================

-- Policies for profiles
create policy "Allow users to read their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Allow users to update their own name"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Policies for prompts (Users can only interact with their own prompts)
create policy "Users can read their own prompts"
  on public.prompts for select
  using (auth.uid() = user_id);

create policy "Users can insert their own prompts"
  on public.prompts for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own prompts"
  on public.prompts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own prompts"
  on public.prompts for delete
  using (auth.uid() = user_id);

-- ========================================================
-- 4. Trigger: Auto-Create Profile on User Sign-Up
-- ========================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, name, is_pro)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    false
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ========================================================
-- 5. Trigger: Prevent Client-Side Spoofing of Subscription
-- ========================================================
-- This function throws an error if a standard client (role: authenticated)
-- tries to update billing columns (is_pro, subscription_id, customer_id, ends_at).
-- Only backend service roles (like Lemon Squeezy webhooks) can bypass this.
create or replace function public.prevent_profile_is_pro_update()
returns trigger as $$
begin
  if (old.is_pro is distinct from new.is_pro or
      old.subscription_id is distinct from new.subscription_id or
      old.customer_id is distinct from new.customer_id or
      old.ends_at is distinct from new.ends_at) then
    
    -- In Supabase, direct JS queries execute under the 'authenticated' role
    if (current_setting('role', true) = 'authenticated') then
      raise exception 'You do not have permission to modify subscription status.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger enforce_profile_is_pro_security
  before update on public.profiles
  for each row execute procedure public.prevent_profile_is_pro_update();
