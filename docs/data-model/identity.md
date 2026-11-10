# E01 – Identity & Authentication Data Model

**Owner:** E01  
**Status:** Draft  
**Module:** Signup, Login & Authentication

---

## 1. Related Requirements

This data model is designed based on the following requirements from the SRS:

- **FR-AUTH-01:** Common Login
- **FR-AUTH-02:** PM Self-Registration
- **FR-AUTH-03:** Trainee Account Creation & Activation
- **FR-AUTH-04:** Forgot Password & Reset Password
- **FR-AUTH-05:** PM Email Verification
- **FR-AUTH-06:** Secure Password Storage
- **FR-AUTH-07:** Fixed User Role
- **FR-AUTH-08:** Session Management
- **FR-AUTH-09:** Role-Based Deep Links

### Additional Technical Requirements (Proposed)

- JWT-based authentication using Access Tokens and Refresh Tokens.
- Role-Based Access Control (RBAC) for PM and Trainee.
- Backend authorization using role-based guards.

These additional technical requirements are proposed for implementation.

---

## 2. Entities

### 2.1 User

The User entity stores the basic information of every registered user.

| Field | Description |
|---|---|
| id | Unique user identifier |
| name | User's full name |
| email | Unique work email |
| role | User role: PM or TRAINEE |
| emailVerifiedAt | Timestamp when the email was verified |
| activatedAt | Timestamp when the account was activated |
| createdAt | Account creation timestamp |
| updatedAt | Last update timestamp |

**Role Definition:**

The system supports two user roles:

- `PM`: Project Manager
- `TRAINEE`: Trainee

Each user must have one fixed role assigned to their account.

**Account Activation:**

- PM accounts become active after successful email verification.
- Trainee accounts become active after successfully setting their password through the invitation link.
- Inactive accounts cannot access protected application resources.

### 2.2 Credential

The Credential entity stores password authentication information separately from the User entity.

| Field | Description |
|---|---|
| id | Unique credential identifier |
| userId | Reference to the associated User |
| passwordHash | Securely hashed password |
| createdAt | Credential creation timestamp |
| updatedAt | Last update timestamp |

**Security Rules:**

- Passwords must never be stored in plain text.
- Passwords must be stored using a secure salted password hashing algorithm such as Argon2id or bcrypt.
- Password verification must be performed on the backend.
- Passwords must contain at least 8 characters.

### 2.3 Session

The Session entity stores authenticated user session information.

| Field | Description |
|---|---|
| id | Unique session identifier |
| userId | Reference to the associated User |
| refreshTokenHash | Hashed refresh token |
| device | Device information |
| createdAt | Session creation timestamp |
| lastSeenAt | Last activity timestamp |
| expiresAt | Session expiration timestamp |
| revokedAt | Session revocation timestamp |

**Security Rules:**

- The application will use JWT Access Tokens and Refresh Tokens.
- Raw refresh tokens must not be stored in the database.
- Only the hashed refresh token will be stored.
- Revoked or expired sessions must not be used to obtain new access tokens.
- Users can view and terminate their active sessions.

### 2.4 AccountInvitation

The AccountInvitation entity manages invitation links sent to newly created Trainee accounts.

| Field | Description |
|---|---|
| id | Unique invitation identifier |
| userId | Reference to the invited User |
| createdByUserId | Reference to the PM who created the account |
| tokenHash | Hashed invitation token |
| expiresAt | Invitation expiration timestamp |
| usedAt | Timestamp when the invitation was used |
| createdAt | Invitation creation timestamp |

**Invitation Rules:**

- Only PM users can create Trainee accounts.
- When a PM creates a Trainee account, the system sends an invitation email to the Trainee's registered email address.
- The invitation email contains a secure, time-limited, single-use activation link.
- The Trainee must open the link and set their own password.
- After successful password setup, the account becomes active.
- Expired or already-used invitation links must be rejected.
- The raw invitation token must never be stored in the database.

### 2.5 EmailVerificationToken

The EmailVerificationToken entity manages email verification for newly registered PM accounts.

| Field | Description |
|---|---|
| id | Unique verification token identifier |
| userId | Reference to the associated User |
| tokenHash | Hashed verification token |
| expiresAt | Token expiration timestamp |
| usedAt | Timestamp when the token was used |
| createdAt | Token creation timestamp |

**Verification Rules:**

- Newly registered PM accounts must verify their email address.
- The system sends an email containing a secure verification link.
- The verification link must be time-limited and single-use.
- After successful verification, the user's `emailVerifiedAt` field is updated.
- Expired or already-used verification links must be rejected.

### 2.6 PasswordResetToken

The PasswordResetToken entity manages password reset requests.

| Field | Description |
|---|---|
| id | Unique password reset token identifier |
| userId | Reference to the associated User |
| tokenHash | Hashed password reset token |
| expiresAt | Token expiration timestamp |
| usedAt | Timestamp when the token was used |
| createdAt | Token creation timestamp |

**Password Reset Rules:**

- Users can request a password reset using their registered email address.
- The system sends a secure, time-limited password reset link.
- Users can set a new password through the link.
- After a successful password reset, the token must become invalid.
- Expired or already-used tokens must be rejected.
- The raw password reset token must never be stored in the database.

---

## 3. Relationships

The following relationships are proposed:

1. One User has one Credential.
2. One User may have multiple Sessions.
3. One User may have multiple AccountInvitation records.
4. One PM User may create multiple AccountInvitation records.
5. One User may have multiple EmailVerificationToken records.
6. One User may have multiple PasswordResetToken records.
7. Each Credential belongs to exactly one User.
8. Each Session belongs to exactly one User.
9. Each AccountInvitation belongs to one invited User and is created by one PM User.
10. Each EmailVerificationToken belongs to exactly one User.
11. Each PasswordResetToken belongs to exactly one User.

### Relationship Overview

```text
                         User
                          |
        +-----------------+-------------------+
        |                 |                   |
        1                 1                  Many
        |                 |                   |
    Credential          Session        AccountInvitation
                                              |
                                         Created By
                                              |
                                             PM

        User
         |
    +----+-----------------------+
    |                            |
  Many                         Many
    |                            |
EmailVerificationToken    PasswordResetToken
```

---

## 4. Unique Constraints

The following unique constraints are proposed:

| Entity | Unique Constraint | Purpose |
|---|---|---|
| User | email | Prevent duplicate user accounts with the same email |
| Credential | userId | Ensure one Credential per User |
| AccountInvitation | tokenHash | Prevent duplicate invitation tokens |
| EmailVerificationToken | tokenHash | Prevent duplicate verification tokens |
| PasswordResetToken | tokenHash | Prevent duplicate password reset tokens |
| Session | id | Unique session identification |

---

## 5. Indexes

The following indexes are proposed:

| Entity | Field | Purpose |
|---|---|---|
| User | email | Find users during login |
| Session | userId | Retrieve sessions belonging to a user |
| Session | expiresAt | Find expired sessions |
| AccountInvitation | userId | Retrieve invitations for a user |
| AccountInvitation | expiresAt | Find expired invitations |
| EmailVerificationToken | userId | Retrieve verification tokens for a user |
| EmailVerificationToken | expiresAt | Find expired verification tokens |
| PasswordResetToken | userId | Retrieve password reset tokens for a user |
| PasswordResetToken | expiresAt | Find expired password reset tokens |

Unique fields may already have database indexes. Redundant indexes will be avoided during Prisma schema implementation.

---

## 6. Authentication Rules

### 6.1 PM Registration

- PM users can register through the signup page.
- PM registration is open to users with a company email.
- Full name, work email, password and password confirmation are required.
- Password must contain at least 8 characters.
- Password and confirm password must match.
- Duplicate email registration must be rejected.
- New PM accounts require email verification.
- PM registration does not require admin approval.
- Newly registered PM accounts receive the PM role.
- PM accounts become active after successful email verification.

### 6.2 Trainee Account Creation & Activation

- Trainee accounts can only be created by PM users.
- Trainees cannot register through the public signup page.
- When a PM creates a new Trainee account, the system sends an invitation email to the Trainee's registered email address.
- The invitation email contains a secure, time-limited, single-use activation link.
- The Trainee opens the invitation link and sets their own password.
- The password and confirm password fields must match.
- After successful password setup, the Trainee account becomes active.
- Expired or already-used invitation links must be rejected.
- Trainees can log in using their registered email or Trainee ID and their newly created password.

### 6.3 Common Login

- PM and Trainee users will use a common login page.
- The login identity field accepts a work email or Trainee ID.
- The user must provide a valid password.
- The backend verifies the credentials.
- The backend retrieves the user's assigned role.
- Only active and eligible accounts can log in.
- The system redirects the user to the appropriate dashboard based on their role.

### 6.4 JWT Authentication

- The backend will issue a JWT Access Token and Refresh Token after successful authentication.
- The Access Token will be used to authenticate protected API requests.
- The Refresh Token will be used to obtain a new Access Token.
- JWT tokens must be securely validated by the backend.
- Raw refresh tokens must not be stored in the database.
- Refresh tokens must be stored as hashes in the Session entity.
- Token expiration and refresh policies must be defined.
- Revoked or expired sessions must not be used to obtain new access tokens.

### 6.5 Password Reset

- Users can request a password reset using their registered email address.
- The system sends a secure password reset link.
- The link must be time-limited and single-use.
- Users can set a new password through the reset link.
- The backend securely hashes and stores the new password.
- The reset token becomes invalid after successful use.
- Expired or already-used reset links must be rejected.

### 6.6 Email Verification

- Newly registered PM accounts must verify their email address.
- The system sends an email verification link after registration.
- The verification link must be secure, time-limited and single-use.
- After successful verification, the account's email verification status is updated.
- Unverified PM accounts cannot access protected application resources.

---

## 7. Role-Based Access Control (RBAC)

Role-Based Access Control will be used to separate PM and Trainee permissions.

### 7.1 User Roles

The application will support two fixed roles:

| Role | Description |
|---|---|
| PM | Project Manager |
| TRAINEE | Trainee |

Each User will have exactly one assigned role.

### 7.2 Role Storage

The user's role will be stored in the `User.role` field.

Proposed Prisma enum:

```prisma
enum UserRole {
  PM
  TRAINEE
}
```

The User model will reference this enum:

```prisma
role UserRole
```

### 7.3 Role-Based Login Flow

After successful authentication:

1. The backend retrieves the authenticated user's account.
2. The backend verifies the user's account status and role.
3. The backend issues application JWT tokens containing the required identity and authorization claims.
4. The frontend redirects the user to the appropriate dashboard.

Example JWT payload:

```json
{
  "sub": "user-101",
  "role": "TRAINEE"
}
```

The payload is an illustrative example, not a final token specification.

### 7.4 Authorization Rules

- PM users can access only PM-authorized resources.
- Trainee users can access only Trainee-authorized resources.
- Trainee users must not access PM-only APIs or resources.
- PM users must not access Trainee-only APIs or resources unless explicitly permitted by project requirements.
- Users cannot change their role through the frontend.
- Role-based authorization must be enforced on the backend.
- NestJS Guards will be used to protect role-restricted API endpoints.

### 7.5 Role Separation

- The application will use one common login system rather than separate authentication systems for PM and Trainee.
- The account's assigned role determines the user's access permissions and dashboard.
- Changing a URL or accessing a protected API directly must not bypass backend authorization.

---

## 8. References to Other Modules

- Trainee-specific information and Trainee Profile belong to E02.
- E01 will not define or modify E02-owned models.
- The relationship between User and Trainee Profile must be reviewed with the E02 owner.
- Trainee ID lookup during login must be coordinated with the E02 module.
- Any cross-module relation must follow the repository's module ownership rules.

---

## 9. Open Questions

The following decisions require review and confirmation before finalizing the schema:

1. What should be the JWT Access Token and Refresh Token expiration policies?
2. What should be the expiration duration for account invitation, email verification and password reset links?
3. Does the Workspace requirement apply to User and Session records in this module?
4. How should Trainee ID lookup be integrated with the E02 module?
5. What should be the final PM and Trainee permission matrix?
6. What should happen when an invitation expires or a user requests a new invitation?

---

## 10. Migration

No database migration will be created at this stage.

Schema implementation and migration will follow the repository's team-approved schema process.

The E01 data model must be reviewed before proceeding with the approved Prisma schema implementation.