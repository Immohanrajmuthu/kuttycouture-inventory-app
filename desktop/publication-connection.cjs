const REPOSITORY = 'Immohanrajmuthu/kuttycouture-website';
const BRANCH = 'main';

function publicationConnection(credentials, fetchRequest = fetch) {
  async function verify() {
    const token = credentials.read();
    async function get(resource) {
      let response;
      try {
        response = await fetchRequest(`https://api.github.com/repos/${REPOSITORY}${resource}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
          signal: AbortSignal.timeout(15000), redirect: 'error',
        });
      } catch {
        throw new Error('Unable to reach GitHub. Check your internet connection and try again.');
      }
      if (response.status === 401) throw new Error('GitHub rejected the token. It may have expired or been revoked. Save a new token and try again.');
      if (response.status === 403 || response.status === 429) throw new Error('GitHub denied access or temporarily limited requests. Check the token permissions, then try again later.');
      if (response.status === 404) throw new Error('The website repository or main branch is unavailable to this token. Check the selected repository.');
      if (!response.ok) throw new Error('GitHub could not verify the connection. Try again later.');
      try { return await response.json(); }
      catch { throw new Error('GitHub returned an unreadable response. Try again later.'); }
    }
    const repository = await get('');
    if (typeof repository.full_name !== 'string' || repository.full_name.toLowerCase() !== REPOSITORY.toLowerCase()) {
      throw new Error('GitHub returned an unexpected repository.');
    }
    const branch = await get(`/branches/${BRANCH}`);
    if (branch.name !== BRANCH || !/^[a-f0-9]{40}$/.test(branch.commit?.sha || '')) throw new Error('GitHub returned an unexpected branch.');
    // Read access does not prove a fine-grained token can write Contents.
    return { repository: REPOSITORY, branch: BRANCH, readVerified: true, writeVerified: false, checkedAt: new Date().toISOString() };
  }
  return { verify };
}

module.exports = { publicationConnection };
