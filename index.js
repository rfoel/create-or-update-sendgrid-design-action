const core = require('@actions/core')
const github = require('@actions/github')
const client = require('@sendgrid/client')
const qs = require('qs')
const fs = require('fs')

const { context } = github
const workspace = process.env.GITHUB_WORKSPACE

client.setApiKey(process.env.SENDGRID_API_KEY)

const getAllDesigns = async page => {
  const params = qs.stringify({
    page_size: 1,
    page_token: page,
    summary: true,
  })

  const { result, _metadata: { next } = {} } = await client
    .request({
      method: 'get',
      url: `/v3/designs?${params}`,
    })
    .then(([, data]) => data)

  if (next) {
    const { page_token } = qs.parse(next.split('?')[1])
    return [...result, ...(await getAllDesigns(page_token))]
  }

  return result
}

const getHtml = name =>
  new Promise((resolve, reject) => {
    fs.readFile(`${workspace}/packages/${name}/dist/template.html`, 'utf8', (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })

const getMetadata = name =>
  new Promise((resolve, reject) => {
    fs.readFile(`${workspace}/packages/${name}/dist/meta.json`, 'utf8', (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })

const createOrUpdateDesign = (id, name, subject, html) => {
  const method = id ? 'PATCH' : 'POST'
  const params = id ? `/${id}` : ''

  return client
    .request({
      method,
      url: `/v3/designs${params}`,
      body: {
        name,
        html_content: html,
        subject,
        generate_plain_content: true,
      },
    })
    .then(([, data]) => data)
}

const run = async () => {
  try {
    console.log('Fetching designs from SendGrid')
    const designs = await getAllDesigns()
    console.log(`${designs.length} designs fetched`)

    const [name] = context.ref.split('/')[2].split('@')
    const html = await getHtml(name)
    const { subject } = await getMetadata(name).then(JSON.parse)
    const design = designs.find(dsgn => dsgn.name === name) || {}

    console.log(`Creating or updating design ${name}`)
    const { updated_at } = await createOrUpdateDesign(design.id, name, subject, html)
    console.log(`${name} created or updated successfully at ${updated_at}`)
  } catch (e) {
    console.log('Something went wrong')
    core.setFailed(e)
  }
}

run()
