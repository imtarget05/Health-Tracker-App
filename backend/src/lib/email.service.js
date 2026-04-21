/**
 * Email service for sending password reset and verification emails
 * Supports Gmail (via app password) or SendGrid
 */
import nodemailer from 'nodemailer';
import { GMAIL_USER, GMAIL_PASSWORD, SENDGRID_API_KEY, NODE_ENV } from '../config/env.js';

let transporter = null;

/**
 * Initialize email transporter based on configuration
 */
export const initEmailTransporter = () => {
    if (transporter) {
        return transporter; // Already initialized
    }

    if (SENDGRID_API_KEY) {
        // Use SendGrid (production recommended)
        transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            auth: {
                user: 'apikey',
                pass: SENDGRID_API_KEY,
            },
        });
    } else if (GMAIL_USER && GMAIL_PASSWORD) {
        // Use Gmail (development/fallback)
        // Note: Use app password, not regular password
        // Get app password from: https://myaccount.google.com/apppasswords
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: GMAIL_USER,
                pass: GMAIL_PASSWORD,
            },
        });
    } else {
        // Fallback: Use console logging (development only)
        console.warn('[EmailService] No email service configured. Using console logging.');
        transporter = {
            sendMail: async (mailOptions) => {
                console.log('[EmailService] Console email:', mailOptions);
                return { messageId: 'console-' + Date.now() };
            },
        };
    }

    return transporter;
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} resetLink - Password reset link from Firebase
 * @returns {Promise<void>}
 */
export const sendPasswordResetEmail = async (email, resetLink) => {
    const transporter = initEmailTransporter();

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Password Reset Request</h2>
      <p>Hi there,</p>
      <p>We received a request to reset the password for your Health Tracker account. Click the link below to reset your password:</p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${resetLink}" 
           style="background-color: #4CAF50; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
      </div>
      
      <p style="color: #666; font-size: 12px;">Or copy and paste this link in your browser:</p>
      <p style="color: #666; font-size: 12px; word-break: break-all;">${resetLink}</p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      
      <p style="color: #999; font-size: 12px;">
        This link will expire in 1 hour. If you didn't request a password reset, please ignore this email or contact support.
      </p>
      
      <p style="color: #999; font-size: 12px;">
        © 2026 Health Tracker. All rights reserved.
      </p>
    </div>
  `;

    const mailOptions = {
        from: GMAIL_USER || process.env.SENDGRID_FROM_EMAIL || 'noreply@health-tracker.com',
        to: email,
        subject: 'Password Reset Request - Health Tracker',
        html: htmlContent,
        text: `Password reset link: ${resetLink}`,
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Password reset email sent to ${email}:`, result.messageId);
        return result;
    } catch (error) {
        console.error(`[EmailService] Failed to send password reset email to ${email}:`, error);
        throw error;
    }
};

/**
 * Send email verification email
 * @param {string} email - User email
 * @param {string} verificationLink - Email verification link
 * @returns {Promise<void>}
 */
export const sendEmailVerificationEmail = async (email, verificationLink) => {
    const transporter = initEmailTransporter();

    const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Verify Your Email</h2>
      <p>Hi there,</p>
      <p>Thank you for registering with Health Tracker! Click the link below to verify your email address:</p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${verificationLink}" 
           style="background-color: #2196F3; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Verify Email
        </a>
      </div>
      
      <p style="color: #666; font-size: 12px;">Or copy and paste this link in your browser:</p>
      <p style="color: #666; font-size: 12px; word-break: break-all;">${verificationLink}</p>
      
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      
      <p style="color: #999; font-size: 12px;">
        This link will expire in 24 hours. If you didn't create this account, please ignore this email.
      </p>
      
      <p style="color: #999; font-size: 12px;">
        © 2026 Health Tracker. All rights reserved.
      </p>
    </div>
  `;

    const mailOptions = {
        from: GMAIL_USER || process.env.SENDGRID_FROM_EMAIL || 'noreply@health-tracker.com',
        to: email,
        subject: 'Verify Your Email - Health Tracker',
        html: htmlContent,
        text: `Verification link: ${verificationLink}`,
    };

    try {
        const result = await transporter.sendMail(mailOptions);
        console.log(`[EmailService] Verification email sent to ${email}:`, result.messageId);
        return result;
    } catch (error) {
        console.error(`[EmailService] Failed to send verification email to ${email}:`, error);
        throw error;
    }
};

export default {
    initEmailTransporter,
    sendPasswordResetEmail,
    sendEmailVerificationEmail,
};
