export interface BendContractIssue {
  code: string;
  message: string;
}

/** A rendered artifact or host record does not satisfy the published contract. */
export class BendIntegrationContractError extends Error {
  readonly code = "bend-integration-contract";
  readonly issues: BendContractIssue[];

  constructor(message: string, issues: BendContractIssue[] = []) {
    super(issues.length > 0 ? `${message} ${issues.map((issue) => issue.message).join(" ")}` : message);
    this.name = "BendIntegrationContractError";
    this.issues = issues;
  }
}

/** The host changed while an update was being prepared. Nothing was committed. */
export class HostUpdateConflictError extends Error {
  readonly code = "host-update-conflict";

  constructor(message = "The host composition changed while this BEND update was being prepared. Reload the host and try again.") {
    super(message);
    this.name = "HostUpdateConflictError";
  }
}

/** The host layer is no longer the source revision that was opened for editing. */
export class HostSourceVersionConflictError extends HostUpdateConflictError {
  readonly expectedSourceVersion: string;
  readonly actualSourceVersion: string;

  constructor(expectedSourceVersion: string, actualSourceVersion: string) {
    super("This BEND layer was updated elsewhere after it was opened. Reopen the layer before committing a new revision.");
    this.name = "HostSourceVersionConflictError";
    this.expectedSourceVersion = expectedSourceVersion;
    this.actualSourceVersion = actualSourceVersion;
  }
}

/** A restored editable package does not match the layer revision that requested it. */
export class HostSourceMismatchError extends BendIntegrationContractError {
  constructor(message = "The editable BEND package does not match this host layer revision.") {
    super(message);
    this.name = "HostSourceMismatchError";
  }
}
