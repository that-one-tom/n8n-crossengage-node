# n8n-crossengage-statistics-node
Custom n8n.io-node allowing users to fetch statistics from CrossEngage 

Compile this node using `n8n-node-dev build` as described under https://docs.n8n.io/nodes/creating-nodes/create-node.html

## Functionality

### Campaign Level Statistics
This is the recommended operation unless you really need a more granular resolution. It is pretty fast as the required statistical data can be obtained through a single endpoint.

### Message Level Statistics
This operation is considerably slower than the campaign level statistics as the data is obtained through two separate requests for every single campaign individually.

### A/B Variation Statistics
Like message level statistics, this operation is considerably slower than the campaign level statistics as the data is obtained through two separate requests for every single campaign individually. It also comes with a restriction that might not be entirely obvious: Where multiple A/B tests run for the same campaign only the results of the latest test can be obtained.

## Disclaimer
This code is neither approved nor supported by CrossEngage.