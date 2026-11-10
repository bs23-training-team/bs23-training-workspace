# E01 – Identity & Authentication Data Model

**Owner:** E01  
**Status:** Draft  
**Module:** Signup, Login & Authentication

---

## 1. Related Requirements

This data model is designed based on the following requirements from the SRS:

- **FR-AUTH-01:** Common Login
- **FR-AUTH-02:** PM Self-Registration
- **FR-AUTH-03:** Trainee Account Creation & First Login Password Change
- **FR-AUTH-04:** Forgot Password & Reset Password
- **FR-AUTH-05:** PM Email Verification
- **FR-AUTH-06:** Secure Password Storage
- **FR-AUTH-07:** Fixed User Role
- **FR-AUTH-08:** Session Management
- **FR-AUTH-09:** Role-Based Deep Links

### Additional Technical Requirements (Proposed)

- JWT-based authentication using Access Tokens and Refresh Tokens.
- Microsoft OAuth 2.0 / OpenID Connect authentication.
- Role-Based Access Control (RBAC) for PM and Trainee.
- Backend authorization using role-based guards.

These additional technical requirements require team confirmation.

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
| mustChangePassword | Indicates whether a trainee must change the temporary password |
| emailVerifiedAt | Timestamp when the email was verified |
| createdAt | Account creation timestamp |
| updatedAt | Last update timestamp |

**Role Definition:**

The system supports two user roles:

- `PM`: Project Manager
- `TRAINEE`: Trainee

Each user must have one fixed role assigned to their account.

### 2.2 Credential

The Credential entity stores password authentication information.

| Field | Description |
|---|---|
| id | Unique credential identifier |
| userId | Reference to the associated User |
| passwordHash | Securely hashed password |
| createdAt | Credential creation timestamp |
| updatedAt | Last update timestamp |

**Security Rule:**

- Passwords must never be stored in plain text.
- Passwords must be stored using a secure salted password hashing algorithm.
- Password verification must be performed on the backend.

### 2.3 OAuthAccount

The OAuthAccount entity stores external identity provider account information.

| Field | Description |
|---|---|
| id | Unique OAuth account identifier |
| userId | Reference to the associated User |
| provider | Identity provider (MICROSOFT) |
| providerAccountId | Unique account identifier provided by Microsoft |
| tenantId | Microsoft tenant identifier |
| createdAt | Account linking timestamp |
| updatedAt | Last update timestamp |

**Security Rules:**

- Microsoft authentication will use OAuth 2.0 / OpenID Connect.
- Microsoft passwords must never be stored in the application database.
- Microsoft identity information must be verified by the backend.
- After successful Microsoft authentication, the application will issue its own JWT tokens.

### 2.4 Session

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

---

## 3. Relationships

The following relationships are proposed:

1. One User has one Credential for password-based authentication.
2. One User may have multiple OAuthAccount records.
3. One User may have multiple Sessions.
4. Each Credential belongs to exactly one User.
5. Each OAuthAccount belongs to exactly one User.
6. Each Session belongs to exactly one User.

### Relationship Overview

```text
                 User
                  |
       +----------+----------+
       |          |          |
       1          1          Many
       |          |          |
   Credential  OAuthAccount  Session
                  Many
```

---

## 4. Unique Constraints

The following unique constraints are proposed:

| Entity | Unique Constraint | Purpose |
|---|---|---|
| User | email | Prevent duplicate user accounts with the same email |
| Credential | userId | Ensure one Credential per User |
| OAuthAccount | provider + providerAccountId | Prevent duplicate linking of the same provider account |
| Session | id | Unique session identification (normally enforced by the primary key) |

---

## 5. Indexes

The following indexes are proposed:

| Entity | Field | Purpose |
|---|---|---|
| User | email | Find users during login |
| OAuthAccount | userId | Find linked provider accounts |
| Session | userId | Retrieve sessions belonging to a user |
| Session | expiresAt | Find expired sessions |

Unique fields may already have database indexes. Redundant indexes will be avoided during Prisma schema implementation.

---

## 6. Authentication Rules

### 6.1 PM Registration

- PM users can register through the signup page.
- PM registration is open to users with a company email.
- Full name, work email, password and password confirmation are required.
- Password must contain at least 8 characters.
- Duplicate email registration must be rejected.
- New PM accounts require email verification.
- PM registration does not require admin approval.
- Newly registered PM accounts receive the PM role.

### 6.2 Trainee Account Creation

- Trainee accounts can only be created by PM users.
- Trainees cannot register through the public signup page.
- A temporary password is assigned when the account is created.
- Trainees must change their temporary password during their first login.

### 6.3 Common Login

- PM and Trainee users will use a common login page.
- The login identity field accepts a work email or Trainee ID.
- The user must provide a valid password.
- The backend verifies the credentials and retrieves the user's assigned role.
- The system redirects the user to the appropriate dashboard based on their role.

### 6.4 JWT Authentication

- The backend will issue a JWT Access Token and Refresh Token after successful authentication.
- The Access Token will be used to authenticate protected API requests.
- The Refresh Token will be used to obtain a new Access Token.
- JWT tokens must be securely validated by the backend.
- Token expiration and refresh policies must be defined.

### 6.5 Microsoft Authentication

- Users can authenticate through Microsoft using OAuth 2.0 / OpenID Connect.
- The backend must verify the Microsoft identity.
- The application must identify or securely link the authenticated Microsoft account to an application User.
- After successful authentication, the application will issue its own JWT tokens.
- Microsoft account eligibility and account-linking rules must be confirmed.

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

This is a proposed implementation structure and will be added after data model review.

### 7.3 Role-Based Login Flow

After successful authentication:

1. The backend retrieves the authenticated user's account.
2. The backend verifies the user's role.
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
- PM users must not access Trainee-only APIs or resources unless explicitly permitted by the project requirements.
- Users cannot change their role through the frontend.
- Role-based authorization must be enforced on the backend.
- NestJS Guards will be used to protect role-restricted API endpoints.

### 7.5 Role Separation

The application will use one common login system rather than separate authentication systems for PM and Trainee.

The account's assigned role determines the user's access permissions and dashboard.

Changing a URL or accessing a protected API directly must not bypass backend authorization.

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

1. Should Microsoft login allow only Brain Station 23 company accounts or any Microsoft account?
2. Should `passwordHash` remain in a separate Credential model or be stored directly in User?
3. What should be the JWT Access Token and Refresh Token expiration policies?
4. How should password-reset and email-verification tokens be represented in the database?
5. How should a Microsoft account be linked to an existing PM or Trainee account?
6. Does the Workspace requirement apply to User and Session records in this module?
7. How should Trainee ID lookup be integrated with the E02 module?
8. What should be the final PM and Trainee permission matrix?

---

## 10. Migration

No database migration will be created at this stage.

Schema implementation and migration will follow the repository's team-approved schema process.

The E01 data model must be reviewed before proceeding with the approved Prisma schema implementation.