/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>STRATO.OPS</Text>
          <Text style={tagline}>// INCOMING INVITATION</Text>
        </Section>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been cleared to join{' '}
          <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>.
          Accept the invitation to provision your account.
        </Text>
        <Section style={{ textAlign: 'center', margin: '32px 0' }}>
          <Button style={button} href={confirmationUrl}>
            ACCEPT INVITATION
          </Button>
        </Section>
        <Text style={footer}>
          If you weren't expecting this, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const mono = "'JetBrains Mono', 'Courier New', Courier, monospace"
const sans = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

const main = { backgroundColor: '#ffffff', fontFamily: sans, margin: 0, padding: 0 }
const container = { padding: '32px 28px', maxWidth: '560px' }
const header = { borderBottom: '2px solid #ff9d00', paddingBottom: '12px', marginBottom: '28px' }
const brand = { fontFamily: mono, fontSize: '18px', fontWeight: 'bold' as const, color: '#050505', letterSpacing: '2px', margin: 0 }
const tagline = { fontFamily: mono, fontSize: '11px', color: '#ff9d00', letterSpacing: '1px', margin: '4px 0 0' }
const h1 = { fontFamily: mono, fontSize: '22px', fontWeight: 'bold' as const, color: '#050505', margin: '0 0 20px', letterSpacing: '0.5px' }
const text = { fontFamily: sans, fontSize: '14px', color: '#3a3a3a', lineHeight: '1.6', margin: '0 0 18px' }
const link = { color: '#ff9d00', textDecoration: 'underline' }
const button = { fontFamily: mono, backgroundColor: '#050505', color: '#ff9d00', fontSize: '13px', fontWeight: 'bold' as const, borderRadius: '4px', padding: '14px 28px', textDecoration: 'none', letterSpacing: '1.5px', border: '1px solid #ff9d00' }
const footer = { fontFamily: mono, fontSize: '11px', color: '#888888', margin: '32px 0 0', borderTop: '1px solid #e5e5e5', paddingTop: '16px', letterSpacing: '0.5px' }
