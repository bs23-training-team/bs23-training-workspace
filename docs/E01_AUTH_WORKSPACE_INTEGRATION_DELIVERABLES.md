
# E01 – Authentication & Workspace
## Integration Deliverables & Developer Handover

| Document Information | Details |
|---|---|
| **Module ID** | E01 |
| **Module Name** | Authentication & Workspace |
| **Document Type** | Integration & Handover Documentation |
| **Purpose** | Define the APIs, services, authentication context, and workspace capabilities provided by E01 to other modules. |

---

## 1. Module Overview

The **Authentication & Workspace (E01)** module provides centralized authentication, authorization, session management, and workspace-level access control.

Other modules will integrate with E01 to authenticate users, verify permissions, access authenticated user information, and maintain workspace-level data isolation.

## 2. Authentication APIs

The following APIs will be provided by E01.

| # | API Name | Method | Endpoint | Description |
|:---:|---|:---:|---|---|
| 1 | PM Signup | `POST` | `/identity/signup` | Register a PM account and create a workspace. |
| 2 | Login | `POST` | `/identity/login` | Authenticate users using email or Trainee ID and password. |
| 3 | Refresh Token | `POST` | `/identity/refresh` | Generate a new access token using a valid refresh token. |
| 4 | Logout | `POST` | `/identity/logout` | Revoke the current login session. |
| 5 | Change Password | `POST` | `/identity/change-password` | Change the authenticated user's password. |
| 6 | Forgot Password | `POST` | `/identity/forgot-password` | Initiate the password recovery process. |
| 7 | Reset Password | `POST` | `/identity/reset-password` | Reset the password using a valid reset token. |

## 3. Authentication Response & User Information

After successful authentication, E01 will provide authenticated user information to other modules.

| # | Field | Description |
|:---:|---|---|
| 1 | `userId` | Unique user identifier. |
| 2 | `name` | User's full name. |
| 3 | `email` | Registered email address. |
| 4 | `role` | User role (`PM` / `TRAINEE`). |
| 5 | `workspaceId` | Associated workspace identifier. |
| 6 | `mustChangePassword` | Indicates whether the user must change their password. |
| 7 | `accountStatus` | Account activation status. |

## 4. JWT Authentication

E01 will provide JWT-based authentication for protected APIs.

### 4.1 JWT Payload

Example JWT payload:

```json
{
  "sub": "user-uuid",
  "workspaceId": "workspace-uuid",
  "role": "PM"
}
```

### 4.2 Authorization Header

Other modules must include the access token when accessing protected APIs.

```http
Authorization: Bearer <access_token>
```

### 4.3 Authenticated User Context

After successful token validation, the authentication guard will make the authenticated user information available through:

```typescript
req.user
```

## 5. Authorization & Role-Based Access Control (RBAC)

E01 will provide centralized authentication and authorization components.

| # | Component | Description |
|:---:|---|---|
| 1 | JWT Authentication Guard | Validate access tokens for protected APIs. |
| 2 | Role-Based Access Control | Enforce permissions based on user roles. |
| 3 | Role Validation | Verify user roles before granting access. |
| 4 | Protected API Access | Restrict unauthorized API access. |
| 5 | Workspace Access Validation | Verify workspace-level access permissions. |

## 6. Session Management

E01 will provide the following session management capabilities.

| # | Service | Description |
|:---:|---|---|
| 1 | Create Session | Create a session after successful login. |
| 2 | Get Active Sessions | Retrieve the user's active login sessions. |
| 3 | Get Current Session | Retrieve information about the current session. |
| 4 | Revoke Session | Terminate a specific login session. |
| 5 | Revoke Other Sessions | Terminate other active sessions. |
| 6 | Session Validation | Verify whether a session is active or revoked. |

## 7. Password Management

E01 will provide the following password management services.

| # | Service | Description |
|:---:|---|---|
| 1 | Password Hashing | Securely hash passwords before storing them. |
| 2 | Password Verification | Verify user credentials during authentication. |
| 3 | Change Password | Update the authenticated user's password. |
| 4 | Forgot Password | Initiate the password recovery process. |
| 5 | Reset Password | Validate reset tokens and update passwords. |
| 6 | Password Validation | Enforce password validation rules. |
| 7 | Reset Token Validation | Validate password reset tokens. |

## 8. Refresh Token Management

E01 will handle the following refresh token operations.

| # | Operation | Description |
|:---:|---|---|
| 1 | Token Generation | Generate refresh tokens during authentication. |
| 2 | Token Validation | Validate incoming refresh tokens. |
| 3 | Token Rotation | Issue a new refresh token when refreshing a session. |
| 4 | Token Expiration | Enforce refresh token expiration. |
| 5 | Token Revocation | Revoke refresh tokens when sessions are terminated. |

## 9. Workspace Management & Isolation

E01 will provide workspace-level identification and access control.

| # | Service | Description |
|:---:|---|---|
| 1 | Workspace Creation | Create a workspace during PM registration. |
| 2 | Workspace Identification | Identify the workspace associated with a user. |
| 3 | Workspace Context | Provide workspace information to other modules. |
| 4 | Workspace Validation | Validate workspace access permissions. |
| 5 | Workspace Isolation | Prevent unauthorized cross-workspace data access. |

## 10. Integration Requirements for Other Modules

All consuming modules must follow these integration requirements.

| # | Requirement | Description |
|:---:|---|---|
| 1 | Authentication Guard | Use the E01 authentication guard for protected APIs. |
| 2 | Access Token | Send the JWT access token in the Authorization header. |
| 3 | User Context | Use authenticated user information from `req.user`. |
| 4 | Role Validation | Apply role-based access restrictions where required. |
| 5 | Workspace Context | Use `workspaceId` to scope workspace-related data. |
| 6 | Resource Validation | Validate resource ownership and workspace access on the server. |
| 7 | Server-Side Security | Never rely only on frontend role checks for authorization. |

## 11. Module Integration Overview

The following modules will consume authentication and workspace services from E01.

| # | Consuming Module | E01 Integration Support |
|:---:|---|---|
| 1 | PM Dashboard | PM identity, role, and workspace context. |
| 2 | Trainee Dashboard | Trainee identity, role, and workspace context. |
| 3 | Trainee Directory | Authentication context and workspace access validation. |
| 4 | Skill Analysis | Authenticated user context and workspace isolation. |
| 5 | Courses & Assignments | User identity, role, and workspace context. |
| 6 | Daily Sprint | Authentication and access validation. |
| 7 | Assessment | User identity, role, and workspace context. |
| 8 | Attendance & Leave | Authentication and workspace validation. |
| 9 | Reports | Authorized user context and workspace identification. |
| 10 | Gamification | Authenticated user identity and workspace context. |
| 11 | Profile & Settings | User identity and account information. |

## 12. Security Standards

E01 will maintain the following security standards.

- Secure password hashing and verification.
- JWT signature and expiration validation.
- Refresh token rotation.
- Session revocation and validation.
- Server-side authorization enforcement.
- Role-Based Access Control (RBAC).
- Workspace-level data isolation.
- Consistent authentication and authorization error handling.

## 13. Final Integration Deliverables

The E01 module will provide the following deliverables to other modules.

| # | Deliverable | What Other Modules Receive |
|:---:|---|---|
| 1 | Authentication APIs | Signup, Login, Refresh Token, Logout, and Password Management endpoints. |
| 2 | User Identity | Authenticated user ID, name, email, role, and workspace ID. |
| 3 | JWT Authentication | Token validation and authenticated user context. |
| 4 | Authorization & RBAC | Role verification and protected API access. |
| 5 | Session Management | Session creation, retrieval, validation, and revocation capabilities. |
| 6 | Password Management | Password hashing, verification, change, and recovery services. |
| 7 | Refresh Token Management | Token validation, rotation, expiration, and revocation. |
| 8 | Workspace Management | Workspace identification, context, and validation. |
| 9 | Workspace Isolation | Workspace-level access control and data isolation. |
| 10 | Security Standards | Common authentication and authorization standards. |

---

## Expected Outcome

Other modules will be able to securely identify authenticated users, verify their roles, access their workspace context, and protect their APIs by integrating with the centralized E01 Authentication & Workspace module.

---

**Document Owner:** E01 – Authentication & Workspace Team  
**Document Status:** Integration Deliverables Draft
