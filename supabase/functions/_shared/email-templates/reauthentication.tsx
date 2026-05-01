/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>STRATO.OPS</Text>
          <Text style={tagline}>// VERIFICATION CODE</Text>
        </Section>
        <Heading style={h1}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Section style={{ textAlign: 'center', margin: '24px 0 32px' }}>
          <Text style={codeStyle}>{token}</Text>
        </Section>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const mono = "'JetBrains Mono', 'Courier New', Courier, monospace"
const sans = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"

const main = { backgroundColor: '#ffffff', fontFamily: sans, margin: 0, padding: 0 }
const container = { padding: '32px 28px', maxWidth: '560px' }
const header = { borderBottom: '2px solid #ff9d00', paddingBottom: '12px', marginBottom: '28px' }
const brand = { fontFamily: mono, fontSize: '18px', fontWeight: 'bold' as const, color: '#050505', letterSpacing: '2px', margin: 0 }
const tagline = { fontFamily: mono, fontSize: '11px', color: '#ff9d00', letterSpacing: '1px', margin: '4px 0 0' }
const h1 = { fontFamily: mono, fontSize: '22px', fontWeight: 'bold' as const, color: '#050505', margin: '0 0 20px', letterSpacing: '0.5px' }
const text = { fontFamily: sans, fontSize: '14px', color: '#3a3a3a', lineHeight: '1.6', margin: '0 0 18px' }
const codeStyle = { fontFamily: mono, fontSize: '32px', fontWeight: 'bold' as const, color: '#050505', letterSpacing: '8px', margin: 0, padding: '16px 24px', backgroundColor: '#fff8ec', border: '1px solid #ff9d00', borderRadius: '4px', display: 'inline-block' }
const footer = { fontFamily: mono, fontSize: '11px', color: '#888888', margin: '32px 0 0', borderTop: '1px solid #e5e5e5', paddingTop: '16px', letterSpacing: '0.5px' }
