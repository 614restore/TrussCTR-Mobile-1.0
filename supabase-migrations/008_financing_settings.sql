-- Migration 008: Financing settings for companies + financing status on contacts
-- Run this in Supabase SQL editor

-- Add financing_links to companies (array of {name, url} objects)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS financing_links jsonb NOT NULL DEFAULT '[]';

-- Add financing tracking fields to contacts
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS financing_status text NOT NULL DEFAULT 'not_offered'
    CHECK (financing_status IN ('not_offered', 'offered', 'applied', 'approved', 'funded')),
  ADD COLUMN IF NOT EXISTS financing_offered_at timestamptz;
